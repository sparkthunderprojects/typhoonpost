import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { deriveAccountKeys } from '@/lib/crypto/kdf';
import {
  newKeyBundle,
  rewrapForNewPassword,
  unlockWithPassword,
  unlockWithRecoveryKey,
  unlockWithWrapKey,
  type StoredKeys,
} from '@/lib/crypto/keys';
import { clearPrivateKey, getPrivateKey, setPrivateKey } from '@/lib/crypto/keyStore';

/**
 * Accounts created before zero-access encryption signed in with their plain password. While this
 * is true, a failed sign-in is retried once with the plain password and, if that works, the
 * account is upgraded in place (new sign-in secret, new keys). Switch it off before inviting
 * real users: it sends the typed password to the server on that fallback attempt.
 */
const LEGACY_PASSWORD_LOGIN = true;

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

type KeyStatus = 'none' | 'checking' | 'locked' | 'ready';

interface Pending {
  wrapKey: Uint8Array;
  authSecret: string;
}

async function fetchStoredKeys(userId: string): Promise<StoredKeys | null> {
  const { data, error } = await supabase
    .from('user_keys')
    .select('public_key, wrapped_by_password, wrapped_by_recovery, version')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    publicKey: data.public_key,
    wrappedByPassword: data.wrapped_by_password,
    wrappedByRecovery: data.wrapped_by_recovery,
    version: data.version,
  };
}

async function saveWrappedPassword(userId: string, stored: StoredKeys) {
  const { error } = await supabase
    .from('user_keys')
    .update({ wrapped_by_password: stored.wrappedByPassword })
    .eq('user_id', userId);
  if (error) throw error;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });
  // The id of the authenticator factor to challenge when the account has two-factor on
  // but this session has only used a password.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [aalChecked, setAalChecked] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('none');
  // Shown exactly once, right after keys are created, then discarded.
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({ session: null, user: null, loading: false });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setState({ session, user: session?.user ?? null, loading: false });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const token = state.session?.access_token;
  useEffect(() => {
    if (!token) {
      setMfaFactorId(null);
      setAalChecked(true);
      return;
    }
    let cancelled = false;
    setAalChecked(false);
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      let factorId: string | null = null;
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        factorId = factors?.totp?.[0]?.id ?? null;
      }
      if (!cancelled) {
        setMfaFactorId(factorId);
        setAalChecked(true);
      }
    })().catch(() => {
      if (!cancelled) setAalChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Once the person is signed in (and past two-factor), unlock or create their mailbox keys.
  const userId = state.user?.id;
  useEffect(() => {
    if (!userId) {
      setKeyStatus('none');
      return;
    }
    if (!aalChecked || mfaFactorId) return;
    if (getPrivateKey()) {
      setKeyStatus('ready');
      return;
    }
    const p = pending.current;
    if (!p) {
      // Signed in from an earlier visit in a new tab: the password is needed again.
      setKeyStatus('locked');
      return;
    }
    let cancelled = false;
    setKeyStatus('checking');
    (async () => {
      let stored = await fetchStoredKeys(userId);
      if (stored) {
        setPrivateKey(unlockWithWrapKey(stored, p.wrapKey));
      } else {
        const bundle = newKeyBundle(p.authSecret, p.wrapKey);
        const { error } = await supabase.from('user_keys').insert({
          user_id: userId,
          public_key: bundle.stored.publicKey,
          wrapped_by_password: bundle.stored.wrappedByPassword,
          wrapped_by_recovery: bundle.stored.wrappedByRecovery,
          version: bundle.stored.version,
        });
        if (error) {
          // Another tab may have created them first; use theirs.
          stored = await fetchStoredKeys(userId);
          if (!stored) throw error;
          setPrivateKey(unlockWithWrapKey(stored, p.wrapKey));
        } else {
          setPrivateKey(bundle.privateKey);
          if (!cancelled) setRecoveryKey(bundle.recoveryKey);
        }
      }
      pending.current = null;
      if (!cancelled) setKeyStatus('ready');
    })().catch((e) => {
      if (cancelled) return;
      pending.current = null;
      setKeyError(e instanceof Error ? e.message : 'Could not set up your mailbox keys.');
      setKeyStatus('locked');
    });
    return () => {
      cancelled = true;
    };
  }, [userId, aalChecked, mfaFactorId]);

  const signInWithPassword = async (email: string, password: string) => {
    const { authSecret, wrapKey } = await deriveAccountKeys(password, email);
    let { error } = await supabase.auth.signInWithPassword({ email, password: authSecret });
    let legacy = false;
    if (error && LEGACY_PASSWORD_LOGIN && /invalid login credentials/i.test(error.message)) {
      const retry = await supabase.auth.signInWithPassword({ email, password });
      if (!retry.error) {
        legacy = true;
        error = null;
      }
    }
    if (error) throw error;
    if (legacy) {
      const { error: upgradeError } = await supabase.auth.updateUser({ password: authSecret });
      if (upgradeError) {
        await supabase.auth.signOut();
        throw upgradeError;
      }
    }
    setKeyError(null);
    pending.current = { wrapKey, authSecret };
    // The key effect above picks this up once the session arrives.
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { authSecret } = await deriveAccountKeys(password, email);
    const { error } = await supabase.auth.signUp({ email, password: authSecret });
    if (error) throw error;
  };

  const verifyMfa = useCallback(
    async (code: string) => {
      if (!mfaFactorId) return;
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: code.trim() });
      if (error) throw error;
      setMfaFactorId(null);
    },
    [mfaFactorId],
  );

  /** Unlock after returning with an existing session but no key in this tab. */
  const unlock = async (password: string) => {
    const user = state.user;
    if (!user?.email) throw new Error('You are not signed in.');
    const stored = await fetchStoredKeys(user.id);
    if (!stored) throw new Error('No keys were found for this account.');
    setPrivateKey(await unlockWithPassword(stored, password, user.email));
    setKeyError(null);
    setKeyStatus('ready');
  };

  /** Forgot the password but have the recovery key: unlock with it and choose a new password. */
  const resetWithRecoveryKey = async (recovery: string, newPassword: string) => {
    const user = state.user;
    if (!user?.email) throw new Error('You are not signed in.');
    const stored = await fetchStoredKeys(user.id);
    if (!stored) throw new Error('No keys were found for this account.');
    const privateKey = unlockWithRecoveryKey(stored, recovery);
    const next = await rewrapForNewPassword(stored, privateKey, newPassword, user.email);
    // Keys first, then the sign-in secret. If the second step fails the recovery key still works.
    await saveWrappedPassword(user.id, next.stored);
    const { error } = await supabase.auth.updateUser({ password: next.authSecret });
    if (error) throw error;
    setPrivateKey(privateKey);
    setPasswordRecovery(false);
    setKeyError(null);
    setKeyStatus('ready');
  };

  const changePassword = async (current: string, next: string) => {
    const user = state.user;
    if (!user?.email) throw new Error('You are not signed in.');
    const stored = await fetchStoredKeys(user.id);
    if (!stored) throw new Error('No keys were found for this account.');
    const privateKey = await unlockWithPassword(stored, current, user.email);
    const rewrapped = await rewrapForNewPassword(stored, privateKey, next, user.email);
    await saveWrappedPassword(user.id, rewrapped.stored);
    const { error } = await supabase.auth.updateUser({ password: rewrapped.authSecret });
    if (error) throw error;
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  };

  const signOut = async () => {
    clearPrivateKey();
    pending.current = null;
    setRecoveryKey(null);
    setPasswordRecovery(false);
    await supabase.auth.signOut();
  };

  return {
    ...state,
    loading: state.loading || (!!state.session && !aalChecked) || keyStatus === 'checking',
    mfaRequired: mfaFactorId !== null,
    verifyMfa,
    keyStatus,
    keyError,
    recoveryKey,
    acknowledgeRecoveryKey: () => setRecoveryKey(null),
    passwordRecovery,
    unlock,
    resetWithRecoveryKey,
    changePassword,
    requestPasswordReset,
    signInWithPassword,
    signUpWithPassword,
    signOut,
  };
}

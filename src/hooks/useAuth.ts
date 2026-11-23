import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });
  // The id of the authenticator factor to challenge when the account has two-factor on
  // but this session has only used a password.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [aalChecked, setAalChecked] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({ session: null, user: null, loading: false });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    ...state,
    loading: state.loading || (!!state.session && !aalChecked),
    mfaRequired: mfaFactorId !== null,
    verifyMfa,
    signInWithPassword,
    signUpWithPassword,
    signOut,
  };
}

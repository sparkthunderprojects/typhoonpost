import { removeAllMyAttachmentFiles } from '@/lib/db';
import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PrivacySettingsProps {
  accountEmail?: string;
  onExportData: () => Promise<void>;
  onAccountDeleted: () => void;
  onChangePassword?: (current: string, next: string) => Promise<void>;
}

const sectionLabel = 'mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle';
const primaryBtn =
  'flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-60';
const quietBtn = 'rounded-lg px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-muted';

function PasswordSection({ onChangePassword }: { onChangePassword: (current: string, next: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field =
    'h-9 w-full rounded-md border border-line-strong bg-bg px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await onChangePassword(current, next);
      setMsg({ ok: true, text: 'Password changed. Your recovery key still works.' });
      setCurrent('');
      setNext('');
      setOpen(false);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change your password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line px-6 py-4">
      <p className={sectionLabel}>
        <ShieldCheck size={13} /> Password and recovery
      </p>
      <p className="mb-3 text-xs text-fg-muted">
        Your password unlocks your mail. Changing it keeps your mail and your recovery key exactly as they are.
      </p>
      {open ? (
        <form onSubmit={submit} className="space-y-2">
          <input aria-label="Current password" type="password" required autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
          <input aria-label="New password" type="password" required minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy && <Loader2 size={12} className="animate-spin" />} Change password
            </button>
            <button type="button" onClick={() => setOpen(false)} className={quietBtn}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className={primaryBtn}>
          Change password
        </button>
      )}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function PrivacySettings({ onExportData, onAccountDeleted, onChangePassword }: PrivacySettingsProps) {
  // ---- Two-factor ----
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.[0]?.id ?? null);
    setLoadingFactors(false);
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  const startEnroll = async () => {
    setMfaBusy(true);
    setMfaError(null);
    try {
      // Clear out any half-finished set-up first so the name below is free.
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of all?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Typhoonpost ${new Date().toISOString().slice(0, 10)}`,
        issuer: 'Typhoonpost',
      });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : 'Could not start two-factor set-up');
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enroll) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
      if (error) throw error;
      setEnroll(null);
      await loadFactors();
    } catch {
      setMfaError('That code is not right. Check your authenticator app and try again.');
    } finally {
      setMfaBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id });
    setEnroll(null);
    setMfaError(null);
  };

  const turnOff = async () => {
    if (!factorId) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await loadFactors();
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : 'Could not turn off two-factor');
    } finally {
      setMfaBusy(false);
    }
  };

  // ---- Export / delete ----
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const doExport = async () => {
    setExporting(true);
    setDataError(null);
    try {
      await onExportData();
    } catch (e) {
      setDataError(e instanceof Error ? e.message : 'Could not export your data');
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setDataError(null);
    // Stored attachment files are not covered by the account deletion itself, so remove them first.
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) await removeAllMyAttachmentFiles(u.user.id);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : 'Could not remove your stored files');
      setDeleting(false);
      return;
    }
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setDataError(error.message);
      setDeleting(false);
      return;
    }
    onAccountDeleted();
  };

  return (
    <>
      {onChangePassword && <PasswordSection onChangePassword={onChangePassword} />}
      <div className="border-b border-line p-4">
        <label className={sectionLabel}>
          <ShieldCheck className="h-3.5 w-3.5" /> Two-factor sign-in
        </label>
        {loadingFactors ? (
          <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
        ) : enroll ? (
          <div>
            <p className="text-xs text-fg-muted">
              Scan this code with an authenticator app such as 1Password, Authy or Google Authenticator, then enter the
              6-digit code it shows.
            </p>
            <img src={enroll.qr} alt="QR code to add Typhoonpost to your authenticator app" className="mx-auto my-3 h-40 w-40 rounded-lg bg-white p-2" />
            <p className="text-center text-2xs text-fg-subtle">
              Can't scan? Enter this key instead: <span className="select-all font-mono text-fg">{enroll.secret}</span>
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              aria-label="6-digit code"
              className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-center text-sm tracking-widest text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {mfaError && <p role="alert" className="mt-2 text-xs text-danger">{mfaError}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={confirmEnroll} disabled={mfaBusy || code.length !== 6} className={primaryBtn}>
                {mfaBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Turn on
              </button>
              <button onClick={cancelEnroll} className={quietBtn}>Cancel</button>
            </div>
          </div>
        ) : factorId ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-success">On. A code is needed to read your mail.</span>
            <button onClick={turnOff} disabled={mfaBusy} className="text-xs font-medium text-danger hover:underline disabled:opacity-60">
              Turn off
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-fg-muted">
              Add a one-time code from an authenticator app. Even someone with your password won't be able to read your
              mail without it.
            </p>
            {mfaError && <p role="alert" className="mt-2 text-xs text-danger">{mfaError}</p>}
            <button onClick={startEnroll} disabled={mfaBusy} className={`${primaryBtn} mt-2`}>
              {mfaBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Set up two-factor
            </button>
          </div>
        )}
      </div>

      <div className="border-b border-line p-4">
        <label className={sectionLabel}>
          <Download className="h-3.5 w-3.5" /> Your data
        </label>
        <p className="mb-2 text-2xs text-fg-subtle">
          Download everything Typhoonpost holds for you (mail, contacts, calendar) as a single file.
        </p>
        <button onClick={doExport} disabled={exporting} className={primaryBtn}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download my data
        </button>

        <div className="mt-4 border-t border-line pt-3">
          {confirmDelete ? (
            <div>
              <p className="text-xs text-fg-muted">
                This permanently deletes your account, your address and every message, contact and event. It cannot be
                undone. Type <strong className="text-fg">DELETE</strong> to confirm.
              </p>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label="Type DELETE to confirm"
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={doDelete}
                  disabled={deleting || typed !== 'DELETE'}
                  className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete everything
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(false);
                    setTyped('');
                  }}
                  className={quietBtn}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-xs font-medium text-danger hover:underline">
              Delete my account
            </button>
          )}
          {dataError && <p role="alert" className="mt-2 text-xs text-danger">{dataError}</p>}
        </div>
      </div>
    </>
  );
}

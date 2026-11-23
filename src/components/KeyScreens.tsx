import { useState } from 'react';
import { Check, Copy, Download, KeyRound, Loader2, Lock } from 'lucide-react';
import { Logo } from '@/components/Logo';

const card = 'w-full max-w-md rounded-2xl border border-line bg-bg-subtle p-7 shadow-panel';
const input =
  'h-11 w-full rounded-md border border-line-strong bg-bg px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25';
const primary =
  'flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-accent-fg shadow-soft transition hover:brightness-110 disabled:opacity-60';
const label = 'mb-1 block text-xs font-semibold text-fg-muted';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-bg p-6 text-fg">
      <div className={card}>
        <Logo size={34} />
        {children}
      </div>
    </div>
  );
}

/** Shown once, right after a mailbox key is created. The key cannot be shown again. */
export function RecoveryKeyScreen({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
    } catch {
      /* clipboard blocked: the key is still on screen */
    }
  };
  const download = () => {
    const blob = new Blob(
      [`Typhoonpost recovery key\n\n${recoveryKey}\n\nKeep this somewhere safe and private. Anyone with it and access to your account can unlock your mail. Typhoonpost cannot recover it for you.\n`],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'typhoonpost-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell>
      <h1 className="mt-6 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <KeyRound className="h-5 w-5 text-accent" /> Save your recovery key
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        Your mail is protected by a key only you hold. If you forget your password, this recovery key is the only way back in.
        We cannot reset it or recover it for you, and we will not show it again.
      </p>
      <p
        data-testid="recovery-key"
        className="mt-5 select-all break-words rounded-xl border border-line bg-bg px-4 py-3 text-center font-mono text-[15px] leading-7 tracking-wider"
      >
        {recoveryKey}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium hover:bg-bg-muted">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={download} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium hover:bg-bg-muted">
          <Download size={14} /> Download
        </button>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent,#0F6CBD)]" />
        <span>I have saved my recovery key somewhere safe.</span>
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className={`${primary} mt-5`}>
        Continue to my mail
      </button>
    </Shell>
  );
}

interface UnlockProps {
  /** `unlock`: enter password. `reset`: choose a new password using the recovery key. */
  initialMode: 'unlock' | 'reset';
  error?: string | null;
  onUnlock: (password: string) => Promise<void>;
  onReset: (recoveryKey: string, newPassword: string) => Promise<void>;
  onSignOut: () => void;
}

export function UnlockScreen({ initialMode, error: outerError, onUnlock, onReset, onSignOut }: UnlockProps) {
  const [mode, setMode] = useState(initialMode);
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(outerError ?? null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'unlock') await onUnlock(password);
      else await onReset(recovery, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit}>
        <h1 className="mt-6 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Lock className="h-5 w-5 text-accent" /> {mode === 'unlock' ? 'Unlock your mailbox' : 'Choose a new password'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {mode === 'unlock'
            ? 'Enter your password to unlock your mail on this device.'
            : 'Enter your recovery key and a new password. Your mail stays exactly as it is.'}
        </p>
        <div className="mt-5 space-y-4">
          {mode === 'unlock' ? (
            <div>
              <label htmlFor="unlock-password" className={label}>Password</label>
              <input id="unlock-password" type="password" autoFocus required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="recovery-key" className={label}>Recovery key</label>
                <input id="recovery-key" autoFocus required autoComplete="off" spellCheck={false} value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="XXXX-XXXX-XXXX-…" className={`${input} font-mono`} />
              </div>
              <div>
                <label htmlFor="new-password" className={label}>New password</label>
                <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
              </div>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${primary} mt-5`}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === 'unlock' ? 'Unlock' : 'Set new password'}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" onClick={() => { setMode(mode === 'unlock' ? 'reset' : 'unlock'); setError(null); }} className="text-accent hover:underline">
          {mode === 'unlock' ? 'Forgot your password?' : 'Back to password'}
        </button>
        <button type="button" onClick={onSignOut} className="text-fg-muted hover:text-fg">
          Sign out
        </button>
      </div>
    </Shell>
  );
}

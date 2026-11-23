import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';

interface MfaScreenProps {
  onVerify: (code: string) => Promise<void>;
  onSignOut: () => void;
}

/** Shown after a correct password when the account has two-factor sign-in turned on. */
export function MfaScreen({ onVerify, onSignOut }: MfaScreenProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onVerify(code);
    } catch {
      setError('That code is not right. Check your authenticator app and try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg p-6 text-fg">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-bg-subtle p-7 shadow-panel">
        <Logo size={34} />
        <h1 className="mt-6 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ShieldCheck className="h-5 w-5 text-accent" /> Enter your security code
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Open your authenticator app and enter the 6-digit code for Typhoonpost.
        </p>
        <label htmlFor="mfa-code" className="sr-only">
          6-digit code
        </label>
        <input
          id="mfa-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          className="mt-5 w-full rounded-xl border border-line bg-bg px-4 py-3 text-center text-2xl tracking-[0.4em] text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify and continue
        </button>
        <button type="button" onClick={onSignOut} className="mt-3 w-full text-center text-xs font-medium text-fg-muted hover:text-fg">
          Sign out
        </button>
      </form>
    </div>
  );
}

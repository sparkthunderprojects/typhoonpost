import { Logo } from '@/components/Logo';
import { useState } from 'react';
import { Loader2, AlertTriangle, Eye, EyeOff, Inbox, CalendarDays, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onForgotPassword?: (email: string) => Promise<void>;
}

export function AuthScreen({ onSignIn, onSignUp, onForgotPassword }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-fg p-6">
        <div className="max-w-md rounded-xl border border-line bg-bg-subtle p-6 shadow-panel">
          <div className="flex items-center gap-2 text-warning mb-3">
            <AlertTriangle size={20} />
            <h1 className="font-semibold">Supabase isn't configured yet</h1>
          </div>
          <p className="text-sm text-fg-muted leading-relaxed">
            Copy <code className="rounded bg-bg-muted px-1 py-0.5">.env.example</code> to{' '}
            <code className="rounded bg-bg-muted px-1 py-0.5">.env</code>, then add your project's{' '}
            <code className="rounded bg-bg-muted px-1 py-0.5">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-bg-muted px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> from the
            Supabase dashboard (Project Settings → API). Restart the dev server afterwards.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
        setNotice('Account created. Check your inbox to confirm your email, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-bg text-fg">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] max-w-[680px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0B4F8A] via-[#0F6CBD] to-[#2B88D8] p-12 text-white lg:flex">
        <Logo size={520} tile={false} className="pointer-events-none absolute -bottom-40 -right-40 text-white/[0.07]" />
        <div className="relative flex items-center gap-2.5">
          <Logo size={34} tile={false} className="text-white" />
          <span className="text-xl font-semibold tracking-tight">Typhoonpost</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Mail, calendar and people. One calm place.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            A fast, focused inbox with the tools you expect from a professional mail platform, and none of the clutter.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { Icon: Inbox, title: 'Focused inbox', text: 'What matters first, the rest one tap away.' },
              { Icon: CalendarDays, title: 'Built-in calendar', text: 'Plan your day without leaving your mail.' },
              { Icon: ShieldCheck, title: 'Private by design', text: 'Trackers blocked and links checked before you open them.' },
            ].map(({ Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">&copy; {new Date().getFullYear()} Typhoonpost</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo size={32} />
            <span className="text-lg font-semibold tracking-tight">Typhoonpost</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="mb-6 mt-1 text-sm text-fg-muted">
            {mode === 'signin' ? 'Welcome back. Your inbox is waiting.' : 'Takes about ten seconds.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-semibold text-fg-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-md border border-line-strong bg-bg-subtle px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-semibold text-fg-muted">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-md border border-line-strong bg-bg-subtle px-3 pr-10 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-subtle hover:text-fg"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'signin' && onForgotPassword && (
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setNotice(null);
                  if (!email) {
                    setError('Enter your email above first, then choose "Forgot password".');
                    return;
                  }
                  try {
                    await onForgotPassword(email);
                    setNotice('If that address has an account, we have sent a link to reset your password. You will need your recovery key.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Something went wrong');
                  }
                }}
                className="text-sm text-accent hover:underline"
              >
                Forgot password?
              </button>
            )}

            {error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-accent-fg shadow-soft transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setNotice(null);
            }}
            className="mt-6 w-full text-center text-sm text-fg-muted transition hover:text-fg"
          >
            {mode === 'signin' ? (
              <>
                New to Typhoonpost? <span className="font-semibold text-accent">Create an account</span>
              </>
            ) : (
              <>
                Already have an account? <span className="font-semibold text-accent">Sign in</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

import { useState } from 'react';
import { Mail, Loader2, AlertTriangle } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

export function AuthScreen({ onSignIn, onSignUp }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="flex h-screen w-screen items-center justify-center bg-bg text-fg p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Mail size={18} />
          </div>
          <span className="text-lg font-semibold">Veloce Mail</span>
        </div>

        <div className="rounded-xl border border-line bg-bg-subtle shadow-panel p-6">
          <h1 className="text-base font-semibold mb-1">
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="text-sm text-fg-muted mb-5">
            {mode === 'signin' ? 'Welcome back.' : 'Takes about ten seconds.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
            {notice && <p className="text-sm text-success">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-fg text-sm font-medium py-2 hover:opacity-90 disabled:opacity-60 transition"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          </form>

          <button
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setNotice(null);
            }}
            className="mt-4 w-full text-center text-sm text-fg-muted hover:text-fg transition"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

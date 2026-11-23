import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });

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

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signInWithPassword, signUpWithPassword, signOut };
}

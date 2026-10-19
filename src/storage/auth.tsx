import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '../services/supabase';

type Auth = {
  /** De app is aan Supabase gekoppeld; zonder koppeling is inloggen niet nodig. */
  configured: boolean;
  ready: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const auth = supabase.auth;
    auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setReady(true));
    const { data: listener } = auth.onAuthStateChange((_event, s) => setSession(s));

    // Token alleen verversen terwijl de app op de voorgrond staat.
    if (AppState.currentState === 'active') auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') auth.startAutoRefresh();
      else auth.stopAutoRefresh();
    });
    return () => {
      listener.subscription.unsubscribe();
      sub.remove();
      auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<Auth>(
    () => ({
      configured: !!supabase,
      ready,
      session,
      signIn: async (email, password) => {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mailadres of wachtwoord onjuist.' : error.message);
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth buiten AuthProvider');
  return auth;
}

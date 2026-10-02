import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

import { useAuth } from './store';

/** Restores the stored session, listens to auth changes, and keeps tokens refreshing in foreground. */
export function useAuthBootstrap(): void {
  const setSession = useAuth((s) => s.setSession);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: calling supabase inside this callback can deadlock the auth lock.
      setTimeout(() => void setSession(session), 0);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    void supabase.auth.startAutoRefresh();
    return () => {
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, [setSession]);
}

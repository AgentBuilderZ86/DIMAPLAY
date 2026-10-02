import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { fetchProfile } from '@/features/profile/api';
import type { Profile } from '@/features/profile/types';

export type AuthStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'ready';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  status: AuthStatus;
  profileError: boolean;
  setSession: (session: Session | null) => Promise<void>;
  refreshProfile: () => Promise<void>;
  reset: () => void;
}

export function statusFor(session: Session | null, profile: Profile | null): AuthStatus {
  if (!session) return 'signedOut';
  if (!profile) return 'loading';
  return profile.onboarding_completed_at ? 'ready' : 'needsOnboarding';
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  status: 'loading',
  profileError: false,
  async setSession(session) {
    if (!session) {
      set({ session: null, profile: null, status: 'signedOut', profileError: false });
      return;
    }
    set({ session, status: 'loading', profileError: false });
    await get().refreshProfile();
  },
  async refreshProfile() {
    const session = get().session;
    if (!session) return;
    try {
      const profile = await fetchProfile(session.user.id);
      set({ profile, status: statusFor(session, profile), profileError: false });
    } catch {
      set({ profileError: true });
    }
  },
  reset: () => set({ session: null, profile: null, status: 'signedOut', profileError: false }),
}));

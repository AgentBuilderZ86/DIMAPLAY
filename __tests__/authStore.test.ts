import type { Session } from '@supabase/supabase-js';

import { statusFor } from '@/features/auth/store';
import type { Profile } from '@/features/profile/types';

const session = { user: { id: 'u1' } } as unknown as Session;
const profile = (done: boolean): Profile => ({
  id: 'u1',
  handle: null,
  display_name: null,
  city: null,
  neighborhood: null,
  sports: [],
  birth_year: null,
  is_minor: false,
  parental_consent_at: null,
  recruiter_visible: false,
  language: 'fr',
  onboarding_completed_at: done ? '2026-10-02T00:00:00Z' : null,
});

it('derives the navigation status from session and profile', () => {
  expect(statusFor(null, null)).toBe('signedOut');
  expect(statusFor(session, null)).toBe('loading');
  expect(statusFor(session, profile(false))).toBe('needsOnboarding');
  expect(statusFor(session, profile(true))).toBe('ready');
});

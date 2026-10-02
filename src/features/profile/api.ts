import { LEGAL_VERSION } from '@/lib/config';
import { supabase } from '@/lib/supabase';

import type { ConsentKind, Profile, ProfileDraft } from './types';

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(userId: string, draft: ProfileDraft): Promise<void> {
  const { error } = await supabase.from('profiles').update(draft).eq('id', userId);
  if (error) throw error;
}

/** Appends a consent decision to the log (granted or revoked). */
export async function recordConsent(
  userId: string,
  kind: Exclude<ConsentKind, 'parental'>,
  granted: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('consents')
    .insert({ user_id: userId, kind, version: LEGAL_VERSION, granted });
  if (error) throw error;
}

export async function completeOnboarding(): Promise<void> {
  const { error } = await supabase.rpc('complete_onboarding');
  if (error) throw error;
}

/** Permanently deletes the account through the server-side function, then clears the session. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

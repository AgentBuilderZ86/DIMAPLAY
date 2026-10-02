import { supabase } from '@/lib/supabase';

export async function sendPhoneOtp(e164: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
  if (error) throw error;
}

export async function verifyPhoneOtp(e164: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
  if (error) throw error;
}

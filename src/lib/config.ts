import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const config = {
  supabaseUrl: extra.supabaseUrl ?? '',
  supabaseAnonKey: extra.supabaseAnonKey ?? '',
  privacyUrl: extra.privacyUrl ?? '',
  termsUrl: extra.termsUrl ?? '',
  supportEmail: extra.supportEmail ?? '',
};

/** Version tag stored with each consent record; bump when the legal texts change. */
export const LEGAL_VERSION = '2026-10-draft';

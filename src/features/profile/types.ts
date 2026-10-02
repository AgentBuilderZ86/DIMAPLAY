import type { Sport } from '@/theme/tokens';

export type { Sport };
export const SPORTS: readonly Sport[] = ['foot', 'padel', 'tennis'];

export type ConsentKind = 'terms' | 'privacy' | 'image' | 'parental';

export interface Profile {
  id: string;
  handle: string | null;
  display_name: string | null;
  city: string | null;
  neighborhood: string | null;
  sports: Sport[];
  birth_year: number | null;
  is_minor: boolean;
  parental_consent_at: string | null;
  recruiter_visible: boolean;
  language: 'fr' | 'ar' | 'en';
  onboarding_completed_at: string | null;
}

export type ProfileDraft = Partial<
  Pick<
    Profile,
    | 'handle'
    | 'display_name'
    | 'city'
    | 'neighborhood'
    | 'sports'
    | 'birth_year'
    | 'language'
    | 'recruiter_visible'
  >
>;

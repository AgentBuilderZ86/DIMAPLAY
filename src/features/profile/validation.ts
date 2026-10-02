import { isValidBirthYear } from '@/lib/age';

import type { ProfileDraft } from './types';

export type FieldError =
  | 'displayNameLength'
  | 'handleFormat'
  | 'sportsRequired'
  | 'cityRequired'
  | 'neighborhoodRequired'
  | 'birthYearInvalid';

export const HANDLE_RE = /^[a-z0-9_.]{3,20}$/;

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

/** Returns the list of problems with the profile fields collected during onboarding. */
export function validateProfileDraft(d: ProfileDraft, now: Date = new Date()): FieldError[] {
  const errors: FieldError[] = [];
  const name = d.display_name?.trim() ?? '';
  if (name.length < 2 || name.length > 40) errors.push('displayNameLength');
  if (d.handle && !HANDLE_RE.test(d.handle)) errors.push('handleFormat');
  if (!d.sports || d.sports.length === 0) errors.push('sportsRequired');
  if ((d.city?.trim().length ?? 0) < 2) errors.push('cityRequired');
  if ((d.neighborhood?.trim().length ?? 0) < 2) errors.push('neighborhoodRequired');
  if (d.birth_year == null || !isValidBirthYear(d.birth_year, now)) errors.push('birthYearInvalid');
  return errors;
}

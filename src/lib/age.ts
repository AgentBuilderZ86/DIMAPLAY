/** Youngest accepted age (by birth year). Open product decision, see docs/PLAN.md. */
export const MIN_AGE_YEARS = 13;
export const MAX_AGE_YEARS = 100;

/**
 * Mirror of public.is_minor_year in SQL. With only a birth year we cannot know the exact age, so
 * anyone who could still be under 18 this year (year difference <= 18) is treated as a minor.
 */
export function isMinorBirthYear(birthYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - birthYear <= 18;
}

export function birthYearRange(now: Date = new Date()): { min: number; max: number } {
  const year = now.getFullYear();
  return { min: year - MAX_AGE_YEARS, max: year - MIN_AGE_YEARS };
}

export function isValidBirthYear(birthYear: number, now: Date = new Date()): boolean {
  const { min, max } = birthYearRange(now);
  return Number.isInteger(birthYear) && birthYear >= min && birthYear <= max;
}

import { birthYearRange, isMinorBirthYear, isValidBirthYear } from '@/lib/age';

const now = new Date('2026-10-02T12:00:00Z');

it('treats anyone who could still be under 18 as a minor (mirrors the SQL rule)', () => {
  expect(isMinorBirthYear(2012, now)).toBe(true);
  expect(isMinorBirthYear(2008, now)).toBe(true); // 17 or 18 depending on birthday
  expect(isMinorBirthYear(2007, now)).toBe(false);
  expect(isMinorBirthYear(1990, now)).toBe(false);
});

it('bounds accepted birth years', () => {
  expect(birthYearRange(now)).toEqual({ min: 1926, max: 2013 });
  expect(isValidBirthYear(2013, now)).toBe(true);
  expect(isValidBirthYear(2014, now)).toBe(false);
  expect(isValidBirthYear(1925, now)).toBe(false);
  expect(isValidBirthYear(1990.5, now)).toBe(false);
});

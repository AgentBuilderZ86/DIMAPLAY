import { normalizeHandle, validateProfileDraft } from '@/features/profile/validation';

const now = new Date('2026-10-02T12:00:00Z');
const valid = {
  display_name: 'Mehdi',
  handle: 'mehdi.a',
  sports: ['foot' as const],
  city: 'Casablanca',
  neighborhood: 'Maârif',
  birth_year: 1990,
};

it('accepts a complete draft', () => {
  expect(validateProfileDraft(valid, now)).toEqual([]);
});

it('reports every missing or invalid field', () => {
  expect(validateProfileDraft({}, now).sort()).toEqual(
    [
      'birthYearInvalid',
      'cityRequired',
      'displayNameLength',
      'neighborhoodRequired',
      'sportsRequired',
    ].sort(),
  );
  expect(validateProfileDraft({ ...valid, handle: 'No Spaces!' }, now)).toEqual(['handleFormat']);
  expect(validateProfileDraft({ ...valid, display_name: 'A' }, now)).toEqual(['displayNameLength']);
  expect(validateProfileDraft({ ...valid, birth_year: 2020 }, now)).toEqual(['birthYearInvalid']);
});

it('treats the handle as optional', () => {
  expect(validateProfileDraft({ ...valid, handle: '' }, now)).toEqual([]);
});

it('normalises handles', () => {
  expect(normalizeHandle('  @Mehdi.A ')).toBe('mehdi.a');
});

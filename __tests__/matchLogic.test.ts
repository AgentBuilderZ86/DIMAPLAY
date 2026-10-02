import { parseScore, resultPhase } from '@/features/matches/logic';
import type { MatchResult, Participant } from '@/features/matches/types';

const now = new Date('2026-10-05T20:00:00Z');
const past = '2026-10-05T18:00:00Z';
const future = '2026-10-06T18:00:00Z';
const match = (starts_at: string) => ({ starts_at, capacity: 4, status: 'open' as const });
const p = (id: string, team: 'A' | 'B' | null): Participant => ({
  user_id: id,
  display_name: id,
  handle: null,
  team,
  elo: 1000,
  is_creator: false,
  image_consent: false,
});
const full = [p('1', 'A'), p('2', 'A'), p('3', 'B'), p('4', 'B')];
const result = (status: MatchResult['status'], submitted_team: 'A' | 'B' = 'A'): MatchResult => ({
  match_id: 'm',
  score_a: 6,
  score_b: 4,
  status,
  submitted_team,
});

it('walks through the score workflow', () => {
  expect(resultPhase(match(future), full, null, 'A', now)).toBe('notStarted');
  expect(
    resultPhase(match(past), [p('1', 'A'), p('2', null), p('3', 'B'), p('4', 'B')], null, 'A', now),
  ).toBe('needsTeams');
  expect(resultPhase(match(past), full, null, 'A', now)).toBe('canSubmit');
  expect(resultPhase(match(past), full, result('pending', 'A'), 'A', now)).toBe('waitingOtherTeam');
  expect(resultPhase(match(past), full, result('pending', 'A'), 'B', now)).toBe('canRespond');
  expect(resultPhase(match(past), full, result('contested'), 'B', now)).toBe('contested');
  expect(resultPhase(match(past), full, result('confirmed'), 'B', now)).toBe('final');
  expect(resultPhase(match(past), full, result('arbitrated'), 'B', now)).toBe('final');
  expect(resultPhase({ ...match(past), status: 'cancelled' }, full, null, 'A', now)).toBe('none');
});

it('parses scores strictly', () => {
  expect(parseScore('6')).toBe(6);
  expect(parseScore(' 12 ')).toBe(12);
  expect(parseScore('')).toBeNull();
  expect(parseScore('-1')).toBeNull();
  expect(parseScore('100')).toBeNull();
  expect(parseScore('4.5')).toBeNull();
});

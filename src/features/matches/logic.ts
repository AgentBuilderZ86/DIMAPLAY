import type { MatchResult, MatchRow, Participant, TeamSide } from './types';

export type ResultPhase =
  | 'notStarted'
  | 'needsTeams'
  | 'canSubmit'
  | 'waitingOtherTeam'
  | 'canRespond'
  | 'contested'
  | 'final'
  | 'none';

/** Where the match stands in the score workflow, from the point of view of one participant. */
export function resultPhase(
  match: Pick<MatchRow, 'starts_at' | 'capacity' | 'status'>,
  participants: Participant[],
  result: MatchResult | null,
  myTeam: TeamSide | null,
  now: Date = new Date(),
): ResultPhase {
  if (match.status === 'cancelled') return 'none';
  if (result) {
    if (result.status === 'confirmed' || result.status === 'arbitrated') return 'final';
    if (result.status === 'contested') return 'contested';
    return myTeam && myTeam !== result.submitted_team ? 'canRespond' : 'waitingOtherTeam';
  }
  if (new Date(match.starts_at) > now) return 'notStarted';
  const half = match.capacity / 2;
  const complete =
    participants.filter((p) => p.team === 'A').length === half &&
    participants.filter((p) => p.team === 'B').length === half;
  if (!complete) return 'needsTeams';
  return myTeam ? 'canSubmit' : 'none';
}

export function parseScore(text: string): number | null {
  return /^\d{1,2}$/.test(text.trim()) ? Number(text.trim()) : null;
}

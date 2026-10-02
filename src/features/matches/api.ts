import { supabase } from '@/lib/supabase';
import type { Sport } from '@/theme/tokens';

import type {
  MatchListItem,
  MatchResult,
  MatchRow,
  NewMatchInput,
  Participant,
  TeamSide,
} from './types';
import { FORMAT_FOR_SPORT } from './types';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const listOpenMatches = (sport: Sport | null, city: string | null) =>
  rpc<MatchListItem[]>('list_open_matches', { p_sport: sport, p_city: city });

export async function fetchMatch(id: string): Promise<{
  match: MatchRow;
  participants: Participant[];
  result: MatchResult | null;
  joinedCount: number;
}> {
  const { data: match, error } = await supabase
    .from('matches')
    .select('*, clubs(name)')
    .eq('id', id)
    .single();
  if (error) throw error;
  const participants = await rpc<Participant[]>('get_match_participants', { p_match: id });
  const joinedCount = await rpc<number>('match_joined_count', { p_match: id });
  const { data: result, error: resultError } = await supabase
    .from('match_results')
    .select('*')
    .eq('match_id', id)
    .maybeSingle();
  if (resultError) throw resultError;
  return {
    match: match as MatchRow,
    participants,
    result: result as MatchResult | null,
    joinedCount,
  };
}

export const createMatch = (i: NewMatchInput) =>
  rpc<string>('create_match', {
    p_sport: i.sport,
    p_format: FORMAT_FOR_SPORT[i.sport],
    p_starts_at: i.startsAt.toISOString(),
    p_club_id: null,
    p_venue: i.venue,
    p_city: i.city,
    p_neighborhood: i.neighborhood,
    p_level: i.level,
    p_image_consent: i.imageConsent,
  });

export const joinMatch = (id: string, imageConsent: boolean) =>
  rpc<void>('join_match', { p_match: id, p_image_consent: imageConsent });
export const leaveMatch = (id: string) => rpc<void>('leave_match', { p_match: id });
export const cancelMatch = (id: string) => rpc<void>('cancel_match', { p_match: id });
export const assignTeam = (id: string, userId: string, team: TeamSide | null) =>
  rpc<void>('assign_team', { p_match: id, p_user: userId, p_team: team });
export const autoBalanceTeams = (id: string) => rpc<void>('auto_balance_teams', { p_match: id });
export const submitResult = (id: string, a: number, b: number) =>
  rpc<void>('submit_result', { p_match: id, p_score_a: a, p_score_b: b });
export const confirmResult = (id: string) => rpc<void>('confirm_result', { p_match: id });
export const contestResult = (id: string) => rpc<void>('contest_result', { p_match: id });

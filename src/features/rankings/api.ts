import { supabase } from '@/lib/supabase';
import type { Sport } from '@/theme/tokens';

export type RankingScope = 'neighborhood' | 'city' | 'morocco';
export const SCOPES: readonly RankingScope[] = ['neighborhood', 'city', 'morocco'];

export interface RankingRow {
  pos: number;
  user_id: string;
  display_name: string | null;
  handle: string | null;
  city: string;
  neighborhood: string;
  elo: number;
  matches_count: number;
  calibrating: boolean;
  change7d: number | null;
  is_me: boolean;
}

export interface Standing {
  elo: number;
  matches_count: number;
  calibrating: boolean;
  rank_neighborhood: number | null;
  rank_city: number | null;
  rank_morocco: number | null;
}

export async function fetchRanking(sport: Sport, scope: RankingScope): Promise<RankingRow[]> {
  const { data, error } = await supabase.rpc('get_ranking', {
    p_sport: sport,
    p_scope: scope,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []) as RankingRow[];
}

export async function fetchMyStanding(sport: Sport): Promise<Standing | null> {
  const { data, error } = await supabase.rpc('get_my_standing', { p_sport: sport });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as Standing | null;
}

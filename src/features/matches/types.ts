import type { Sport } from '@/theme/tokens';

export type MatchFormat = '5v5' | 'double' | 'simple';
export type MatchLevel = 'any' | 'beginner' | 'intermediate' | 'advanced';
export type TeamSide = 'A' | 'B';
export type ResultStatus = 'pending' | 'confirmed' | 'contested' | 'arbitrated';

export const FORMAT_FOR_SPORT: Record<Sport, MatchFormat> = {
  foot: '5v5',
  padel: 'double',
  tennis: 'simple',
};
export const LEVELS: readonly MatchLevel[] = ['any', 'beginner', 'intermediate', 'advanced'];

export interface MatchListItem {
  id: string;
  sport: Sport;
  format: MatchFormat;
  level: MatchLevel;
  starts_at: string;
  city: string;
  neighborhood: string | null;
  club_name: string | null;
  venue: string | null;
  capacity: number;
  joined_count: number;
  joined: boolean;
}

export interface MatchRow {
  id: string;
  sport: Sport;
  format: MatchFormat;
  level: MatchLevel;
  starts_at: string;
  city: string;
  neighborhood: string | null;
  venue: string | null;
  capacity: number;
  creator_id: string | null;
  status: 'open' | 'cancelled' | 'finished';
  clubs: { name: string } | null;
}

export interface Participant {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  team: TeamSide | null;
  elo: number;
  is_creator: boolean;
  image_consent: boolean;
}

export interface MatchResult {
  match_id: string;
  score_a: number;
  score_b: number;
  status: ResultStatus;
  submitted_team: TeamSide;
}

export interface NewMatchInput {
  sport: Sport;
  startsAt: Date;
  venue: string;
  city: string;
  neighborhood: string;
  level: MatchLevel;
  imageConsent: boolean;
}

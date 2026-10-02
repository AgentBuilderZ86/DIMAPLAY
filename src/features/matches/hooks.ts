import { useQuery } from '@tanstack/react-query';

import { fetchMatch, listOpenMatches } from './api';
import type { Sport } from '@/theme/tokens';

export const matchKeys = {
  list: (sport: Sport | null, city: string | null) => ['matches', 'list', sport, city] as const,
  detail: (id: string) => ['matches', 'detail', id] as const,
};

export const useOpenMatches = (sport: Sport | null, city: string | null) =>
  useQuery({ queryKey: matchKeys.list(sport, city), queryFn: () => listOpenMatches(sport, city) });

export const useMatch = (id: string) =>
  useQuery({ queryKey: matchKeys.detail(id), queryFn: () => fetchMatch(id) });

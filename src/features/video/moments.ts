import type { Sport } from '@/theme/tokens';

export type MomentType =
  'goal' | 'assist' | 'save' | 'smash' | 'bandeja' | 'defense' | 'ace' | 'passing' | 'volley';

/** Must stay in sync with public.moment_type_ok in the database. */
export const MOMENTS_BY_SPORT: Record<Sport, readonly MomentType[]> = {
  foot: ['goal', 'assist', 'save'],
  padel: ['smash', 'bandeja', 'defense'],
  tennis: ['ace', 'passing', 'volley'],
};

export const MAX_VIDEO_SECONDS = 2 * 60 * 60;
export const CLIP_BEFORE_SECONDS = 8;
export const CLIP_AFTER_SECONDS = 4;

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

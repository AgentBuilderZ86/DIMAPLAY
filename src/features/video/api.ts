import { Paths, File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { Sport } from '@/theme/tokens';

import type { MomentType } from './moments';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface FilmableMatch {
  id: string;
  sport: Sport;
  starts_at: string;
  place: string;
  city: string;
  recording_video_id: string | null;
  filmer_is_me: boolean;
}

export const listFilmableMatches = () => rpc<FilmableMatch[]>('my_matches_for_filming');

export const startRecording = (
  matchId: string,
  source: 'camera' | 'import' = 'camera',
  startedAt?: Date,
) =>
  rpc<string>('start_recording', {
    p_match: matchId,
    p_source: source,
    p_started_at: startedAt?.toISOString() ?? null,
  });
export const stopRecording = (videoId: string, durationSeconds: number) =>
  rpc<void>('stop_recording', {
    p_video: videoId,
    p_duration_seconds: Math.round(durationSeconds * 100) / 100,
  });
export const setVideoDuration = (videoId: string, durationSeconds: number) =>
  rpc<void>('set_video_duration', {
    p_video: videoId,
    p_duration_seconds: Math.round(durationSeconds * 100) / 100,
  });
export const markMoment = (matchId: string, type: MomentType, subjectId?: string) =>
  rpc<string>('mark_moment', { p_match: matchId, p_type: type, p_subject: subjectId ?? null });
export const addMomentAt = (
  videoId: string,
  type: MomentType,
  offsetMs: number,
  subjectId?: string,
) =>
  rpc<string>('add_moment_at', {
    p_video: videoId,
    p_type: type,
    p_subject: subjectId ?? null,
    p_offset_ms: Math.round(offsetMs),
  });

export interface ClipRow {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  visibility: 'match' | 'public';
  storage_path: string | null;
  match_id: string;
  start_ms: number;
  end_ms: number;
  created_at: string;
  moment: { type: MomentType; subject_user_id: string | null } | null;
  match: { sport: Sport; starts_at: string; venue: string | null } | null;
}

export async function listClips(): Promise<ClipRow[]> {
  const { data, error } = await supabase
    .from('clips')
    .select(
      'id, status, visibility, storage_path, match_id, start_ms, end_ms, created_at, moment:moments(type, subject_user_id), match:matches(sport, starts_at, venue)',
    )
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as ClipRow[];
}

export async function getClip(id: string): Promise<ClipRow> {
  const all = await supabase
    .from('clips')
    .select(
      'id, status, visibility, storage_path, match_id, start_ms, end_ms, created_at, moment:moments(type, subject_user_id), match:matches(sport, starts_at, venue)',
    )
    .eq('id', id)
    .single();
  if (all.error) throw all.error;
  return all.data as unknown as ClipRow;
}

export async function signedClipUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('clips').createSignedUrl(path, seconds);
  if (error || !data) throw error ?? new Error('no_signed_url');
  return data.signedUrl;
}

/** Downloads a clip to the cache so the iOS share sheet can hand the file to TikTok, Instagram, WhatsApp. */
export async function downloadClip(url: string, clipId: string): Promise<string> {
  const target = new File(Paths.cache, `dima-${clipId}.mp4`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  return file.uri;
}

export async function setClipVisibility(
  clipId: string,
  visibility: 'match' | 'public',
): Promise<void> {
  await rpc<void>('set_clip_visibility', { p_clip: clipId, p_visibility: visibility });
}

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VideoProvider } from '../../supabase/functions/_shared/videoProvider.ts';
import { buildVerticalClipArgs, runFfmpeg } from './ffmpeg.ts';
import { sendClipsReady, type Lang, type PushTarget } from './push.ts';

export interface WorkerDeps {
  db: SupabaseClient;
  provider: VideoProvider;
  /** Overridable for tests. */
  render?: (args: string[]) => Promise<void>;
  fetchFn?: typeof fetch;
  log?: (msg: string) => void;
}

interface Claimed {
  clip_id: string;
  video_id: string;
  match_id: string;
  start_ms: number;
  end_ms: number;
  provider: string | null;
  provider_asset_id: string | null;
}

const BUCKET = 'clips';

/** Renders one claimed clip and uploads it; returns true when the clip is ready. */
export async function processClip(deps: WorkerDeps, c: Claimed): Promise<boolean> {
  const { db, provider } = deps;
  const dir = await mkdtemp(join(tmpdir(), 'clip-'));
  const output = join(dir, 'clip.mp4');
  try {
    if (!c.provider_asset_id) throw new Error('video has no provider asset');
    const input = await provider.getDownloadUrl(c.provider_asset_id);
    if (!input) throw new Error('original not downloadable yet'); // retried by the queue
    await (deps.render ?? runFfmpeg)(
      buildVerticalClipArgs({
        input,
        startSeconds: c.start_ms / 1000,
        durationSeconds: (c.end_ms - c.start_ms) / 1000,
        output,
      }),
    );
    const path = `${c.match_id}/${c.clip_id}.mp4`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, await readFile(output), { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new Error(`storage_upload: ${upErr.message}`);
    const { error } = await db
      .from('clips')
      .update({
        status: 'ready',
        storage_path: path,
        ready_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', c.clip_id);
    if (error) throw new Error(`db_update: ${error.message}`);
    return true;
  } catch (e) {
    // Back to the queue; claim_clips() gives up for good after 3 attempts.
    await db
      .from('clips')
      .update({ status: 'queued', error: (e as Error).message.slice(0, 300) })
      .eq('id', c.clip_id);
    deps.log?.(`clip ${c.clip_id} failed: ${(e as Error).message}`);
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Sends "your clips are ready" once, when the last queued clip of a video became ready. */
export async function notifyIfVideoComplete(deps: WorkerDeps, videoId: string): Promise<number> {
  const { db } = deps;
  const { data: pending } = await db
    .from('clips')
    .select('id')
    .eq('video_id', videoId)
    .in('status', ['queued', 'processing'])
    .limit(1);
  if (pending && pending.length > 0) return 0;
  const { data: ready } = await db
    .from('clips')
    .select('id, match_id')
    .eq('video_id', videoId)
    .eq('status', 'ready');
  if (!ready || ready.length === 0) return 0;

  const { data: video } = await db.from('videos').select('author_id').eq('id', videoId).single();
  const { data: moments } = await db
    .from('moments')
    .select('created_by, subject_user_id')
    .eq('video_id', videoId);
  const users = new Set<string>([video!.author_id as string]);
  for (const m of moments ?? []) {
    users.add(m.created_by as string);
    if (m.subject_user_id) users.add(m.subject_user_id as string);
  }
  const ids = [...users];
  const { data: tokens } = await db.from('push_tokens').select('user_id, token').in('user_id', ids);
  const { data: profiles } = await db.from('profiles').select('id, language').in('id', ids);
  const lang = new Map((profiles ?? []).map((p) => [p.id as string, p.language as Lang]));
  const targets: PushTarget[] = (tokens ?? []).map((t) => ({
    token: t.token as string,
    language: lang.get(t.user_id as string) ?? 'fr',
  }));
  return sendClipsReady(targets, { matchId: ready[0]!.match_id as string }, deps.fetchFn);
}

/** Erases provider assets and stored clip files queued by account deletion / expiry. */
export async function processDeletions(deps: WorkerDeps, limit = 50): Promise<number> {
  const { db, provider } = deps;
  const { data: rows } = await db
    .from('provider_deletions')
    .select('id, provider, asset_id')
    .is('done_at', null)
    .order('id')
    .limit(limit);
  let done = 0;
  for (const r of rows ?? []) {
    try {
      if (r.provider === 'supabase-storage') {
        const { error } = await db.storage.from(BUCKET).remove([r.asset_id as string]);
        if (error) throw new Error(error.message);
      } else if (r.provider === provider.name) {
        await provider.deleteAsset(r.asset_id as string);
      } else {
        continue;
      }
      await db
        .from('provider_deletions')
        .update({ done_at: new Date().toISOString() })
        .eq('id', r.id);
      done++;
    } catch (e) {
      deps.log?.(`deletion ${r.id} failed: ${(e as Error).message}`);
    }
  }
  return done;
}

/** One pass of the worker loop. Returns counts for logging/tests. */
export async function runOnce(deps: WorkerDeps, batch = 3) {
  const { db } = deps;
  await db.rpc('requeue_stuck_clips');
  const { data: claimed, error } = await db.rpc('claim_clips', { p_limit: batch });
  if (error) throw new Error(`claim_clips: ${error.message}`);
  const touched = new Set<string>();
  let ready = 0;
  for (const c of (claimed ?? []) as Claimed[]) {
    if (await processClip(deps, c)) ready++;
    touched.add(c.video_id);
  }
  let notified = 0;
  for (const v of touched) notified += await notifyIfVideoComplete(deps, v);
  const deleted = await processDeletions(deps);
  return { claimed: (claimed ?? []).length, ready, notified, deleted };
}

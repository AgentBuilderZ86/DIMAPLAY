/**
 * @jest-environment node
 */
import { writeFile } from 'node:fs/promises';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VideoProvider } from '../supabase/functions/_shared/videoProvider';
import { sendClipsReady } from '../worker/src/push';
import {
  notifyIfVideoComplete,
  processClip,
  processDeletions,
  runOnce,
} from '../worker/src/worker';

type Row = Record<string, unknown>;

/** Tiny in-memory stand-in for the PostgREST query builder used by the worker. */
function fakeDb(seed: Record<string, Row[]>, rpcs: Record<string, () => unknown> = {}) {
  const tables = structuredClone(seed);
  const uploads: { path: string; size: number }[] = [];
  const removed: string[] = [];
  const builder = (name: string) => {
    let rows = tables[name] ?? (tables[name] = []);
    let patch: Row | null = null;
    let limit = Infinity;
    const filters: ((r: Row) => boolean)[] = [];
    const run = () => {
      const hit = rows.filter((r) => filters.every((f) => f(r))).slice(0, limit);
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      return hit;
    };
    const q: any = {
      select: () => q,
      update: (p: Row) => ((patch = p), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => void) => res({ data: run(), error: null }),
    };
    return q;
  };
  const db = {
    from: builder,
    rpc: async (fn: string) => ({ data: rpcs[fn]?.() ?? null, error: null }),
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer) => (
          uploads.push({ path, size: body.length }),
          { error: null }
        ),
        remove: async (paths: string[]) => (removed.push(...paths), { error: null }),
      }),
    },
  } as unknown as SupabaseClient;
  return { db, tables, uploads, removed };
}

const provider = (over: Partial<VideoProvider> = {}): VideoProvider => ({
  name: 'cloudflare-stream',
  createUpload: jest.fn(),
  getAsset: jest.fn(),
  getDownloadUrl: async () => 'https://cdn.example/o.mp4',
  deleteAsset: jest.fn(async () => {}),
  parseWebhook: jest.fn(),
  ...over,
});

const claimed = {
  clip_id: 'c1',
  video_id: 'v1',
  match_id: 'm1',
  start_ms: 292000,
  end_ms: 304000,
  provider: 'cloudflare-stream',
  provider_asset_id: 'asset1',
};

describe('processClip', () => {
  it('renders a 12 s vertical clip, uploads it and marks the clip ready', async () => {
    const { db, tables, uploads } = fakeDb({ clips: [{ id: 'c1', status: 'processing' }] });
    const render = jest.fn(async (args: string[]) => {
      await writeFile(args.at(-1)!, Buffer.from('fake-mp4'));
    });
    const ok = await processClip({ db, provider: provider(), render }, claimed);
    expect(ok).toBe(true);
    const args = render.mock.calls[0]![0];
    expect(args[args.indexOf('-ss') + 1]).toBe('292.000');
    expect(args[args.indexOf('-t') + 1]).toBe('12.000');
    expect(args).toContain('https://cdn.example/o.mp4');
    expect(uploads).toEqual([{ path: 'm1/c1.mp4', size: 8 }]);
    expect(tables.clips![0]).toMatchObject({ status: 'ready', storage_path: 'm1/c1.mp4' });
  });

  it('sends the clip back to the queue with the error when rendering fails', async () => {
    const { db, tables, uploads } = fakeDb({ clips: [{ id: 'c1', status: 'processing' }] });
    const ok = await processClip(
      {
        db,
        provider: provider(),
        render: async () => {
          throw new Error('ffmpeg exited with 1');
        },
      },
      claimed,
    );
    expect(ok).toBe(false);
    expect(tables.clips![0]).toMatchObject({ status: 'queued', error: 'ffmpeg exited with 1' });
    expect(uploads).toHaveLength(0);
  });

  it('retries later when the provider has no MP4 yet', async () => {
    const { db, tables } = fakeDb({ clips: [{ id: 'c1', status: 'processing' }] });
    const ok = await processClip(
      { db, provider: provider({ getDownloadUrl: async () => null }), render: jest.fn() },
      claimed,
    );
    expect(ok).toBe(false);
    expect(tables.clips![0]).toMatchObject({ status: 'queued' });
  });
});

describe('notifications', () => {
  const seed = () => ({
    clips: [
      { id: 'c1', video_id: 'v1', match_id: 'm1', status: 'ready' },
      { id: 'c2', video_id: 'v1', match_id: 'm1', status: 'ready' },
    ],
    videos: [{ id: 'v1', author_id: 'u1' }],
    moments: [{ video_id: 'v1', created_by: 'u2', subject_user_id: 'u3' }],
    push_tokens: [
      { user_id: 'u1', token: 'ExponentPushToken[a]' },
      { user_id: 'u3', token: 'ExponentPushToken[c]' },
      { user_id: 'u9', token: 'ExponentPushToken[x]' },
    ],
    profiles: [
      { id: 'u1', language: 'fr' },
      { id: 'u3', language: 'ar' },
    ],
  });
  const okFetch = (sent: unknown[]) =>
    (async (_u: string, init: { body: string }) => {
      sent.push(...JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({ data: JSON.parse(init.body).map(() => ({ status: 'ok' })) }),
      };
    }) as unknown as typeof fetch;

  it('notifies the filmer and the players concerned, in their language, once all clips are ready', async () => {
    const sent: { to: string; title: string }[] = [];
    const { db } = fakeDb(seed());
    const n = await notifyIfVideoComplete(
      { db, provider: provider(), fetchFn: okFetch(sent) },
      'v1',
    );
    expect(n).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[c]']);
    expect(sent.find((m) => m.to.endsWith('[a]'))!.title).toBe('Tes clips sont prêts');
    expect(sent.find((m) => m.to.endsWith('[c]'))!.title).toBe('مقاطعك جاهزة');
  });

  it('stays silent while some clips are still being rendered', async () => {
    const s = seed();
    s.clips[1]!.status = 'queued';
    const sent: unknown[] = [];
    const { db } = fakeDb(s);
    expect(
      await notifyIfVideoComplete({ db, provider: provider(), fetchFn: okFetch(sent) }, 'v1'),
    ).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('does nothing without tokens', async () => {
    expect(await sendClipsReady([], { matchId: 'm1' })).toBe(0);
  });
});

describe('processDeletions and runOnce', () => {
  it('erases provider assets and stored files, then marks them done', async () => {
    const { db, tables, removed } = fakeDb({
      provider_deletions: [
        { id: 1, provider: 'cloudflare-stream', asset_id: 'asset1', done_at: null },
        { id: 2, provider: 'supabase-storage', asset_id: 'm1/c1.mp4', done_at: null },
        { id: 3, provider: 'other-provider', asset_id: 'z', done_at: null },
      ],
    });
    const p = provider();
    expect(await processDeletions({ db, provider: p })).toBe(2);
    expect(p.deleteAsset).toHaveBeenCalledWith('asset1');
    expect(removed).toEqual(['m1/c1.mp4']);
    expect(
      tables.provider_deletions!.map((r) => r.done_at !== null && r.done_at !== undefined),
    ).toEqual([true, true, false]);
  });

  it('claims, renders, notifies and cleans up in one pass', async () => {
    const sent: unknown[] = [];
    const { db } = fakeDb(
      {
        clips: [{ id: 'c1', video_id: 'v1', match_id: 'm1', status: 'processing' }],
        videos: [{ id: 'v1', author_id: 'u1' }],
        moments: [],
        push_tokens: [{ user_id: 'u1', token: 'ExponentPushToken[a]' }],
        profiles: [{ id: 'u1', language: 'en' }],
        provider_deletions: [],
      },
      { claim_clips: () => [claimed] },
    );
    const render = async (args: string[]) => writeFile(args.at(-1)!, 'x');
    const fetchFn = (async (_u: string, init: { body: string }) => (
      sent.push(...JSON.parse(init.body)),
      { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }
    )) as unknown as typeof fetch;
    const r = await runOnce({ db, provider: provider(), render, fetchFn });
    expect(r).toEqual({ claimed: 1, ready: 1, notified: 1, deleted: 0 });
    expect(sent).toHaveLength(1);
  });
});

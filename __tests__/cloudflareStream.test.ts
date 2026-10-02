import { _hmacHexForTests, cloudflareStream } from '../supabase/functions/_shared/cloudflareStream';

const calls: { url: string; init?: RequestInit }[] = [];
function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
}
const cfg = (fetchFn: typeof fetch) => ({
  accountId: 'acc',
  apiToken: 'tok',
  webhookSecret: 'whsec',
  fetchFn,
});
beforeEach(() => (calls.length = 0));

it('creates a tus direct upload with duration, deadline and private playback', async () => {
  const p = cloudflareStream(
    cfg(
      fakeFetch(
        () =>
          new Response(null, {
            status: 201,
            headers: {
              Location: 'https://upload.cloudflarestream.com/u1',
              'stream-media-id': 'asset1',
            },
          }),
      ),
    ),
  );
  const out = await p.createUpload({
    sizeBytes: 4_000_000_000,
    maxDurationSeconds: 3600,
    uploadDeadline: new Date('2026-10-05T00:00:00Z'),
    name: 'match-1',
  });
  expect(out).toEqual({ assetId: 'asset1', uploadUrl: 'https://upload.cloudflarestream.com/u1' });
  const h = calls[0]!.init!.headers as Record<string, string>;
  expect(calls[0]!.url).toBe(
    'https://api.cloudflare.com/client/v4/accounts/acc/stream?direct_user=true',
  );
  expect(h['Tus-Resumable']).toBe('1.0.0');
  expect(h['Upload-Length']).toBe('4000000000');
  expect(h.Authorization).toBe('Bearer tok');
  expect(h['Upload-Metadata']).toContain(`maxDurationSeconds ${btoa('3600')}`);
  expect(h['Upload-Metadata']).toContain('requiresignedurls');
});

it('fails loudly when Cloudflare omits the upload headers', async () => {
  const p = cloudflareStream(cfg(fakeFetch(() => new Response(null, { status: 201 }))));
  await expect(
    p.createUpload({ sizeBytes: 1, maxDurationSeconds: 1, uploadDeadline: new Date(), name: 'x' }),
  ).rejects.toThrow('missing_upload_headers');
});

it('maps asset states', async () => {
  const body = (result: object) => new Response(JSON.stringify({ success: true, result }));
  const p = cloudflareStream(cfg(fakeFetch(() => body({ readyToStream: true, duration: 612.4 }))));
  expect(await p.getAsset('a')).toEqual({ state: 'ready', durationSeconds: 612.4 });
  const q = cloudflareStream(
    cfg(fakeFetch(() => body({ status: { state: 'error' }, duration: -1 }))),
  );
  expect(await q.getAsset('a')).toEqual({ state: 'failed', durationSeconds: undefined });
  const r = cloudflareStream(cfg(fakeFetch(() => body({ status: { state: 'inprogress' } }))));
  expect((await r.getAsset('a')).state).toBe('processing');
});

it('treats deleting an already-deleted asset as success', async () => {
  const p = cloudflareStream(cfg(fakeFetch(() => new Response(null, { status: 404 }))));
  await expect(p.deleteAsset('gone')).resolves.toBeUndefined();
  const q = cloudflareStream(cfg(fakeFetch(() => new Response(null, { status: 500 }))));
  await expect(q.deleteAsset('x')).rejects.toThrow('500');
});

describe('webhook verification', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const time = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ uid: 'asset1', readyToStream: true, duration: 3000.5 });
  const provider = cloudflareStream(cfg(fakeFetch(() => new Response(null))));

  it('accepts a correctly signed event', async () => {
    const sig = await _hmacHexForTests('whsec', `${time}.${body}`);
    const ev = await provider.parseWebhook(
      body,
      { 'webhook-signature': `time=${time},sig1=${sig}` },
      now,
    );
    expect(ev).toEqual({ assetId: 'asset1', state: 'ready', durationSeconds: 3000.5 });
  });

  it('rejects a bad signature, a tampered body and stale timestamps', async () => {
    const sig = await _hmacHexForTests('whsec', `${time}.${body}`);
    expect(
      await provider.parseWebhook(
        body,
        { 'webhook-signature': `time=${time},sig1=${'0'.repeat(64)}` },
        now,
      ),
    ).toBeNull();
    expect(
      await provider.parseWebhook(
        body.replace('asset1', 'asset2'),
        { 'webhook-signature': `time=${time},sig1=${sig}` },
        now,
      ),
    ).toBeNull();
    expect(
      await provider.parseWebhook(
        body,
        { 'webhook-signature': `time=${Number(time) - 3600},sig1=${sig}` },
        now,
      ),
    ).toBeNull();
    expect(await provider.parseWebhook(body, {}, now)).toBeNull();
  });
});

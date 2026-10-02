/**
 * @jest-environment node
 */
import { createHash } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';

import {
  TusFatalError,
  TusRetryExhausted,
  tusUpload,
  type ChunkSource,
} from '@/features/video/tus';

const MiB = 1024 * 1024;

/** jest-expo replaces global fetch, so tests talk to the real socket through node:http. */
const nodeFetch = ((
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array;
    signal?: AbortSignal;
  } = {},
) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, { method: init.method, headers: init.headers }, (res) => {
      res.resume();
      res.on('end', () =>
        resolve({
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode,
          headers: {
            get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null,
          },
        }),
      );
    });
    req.on('error', reject);
    init.signal?.addEventListener('abort', () =>
      req.destroy(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    if (init.body) req.write(init.body);
    req.end();
  })) as unknown as typeof fetch;

/** In-memory tus server with fault injection, listening on a real socket. */
function startServer(opts: {
  size: number;
  faults?: (req: { n: number; offset: number }) => 'cut' | '503' | '404' | null;
}) {
  let stored = Buffer.alloc(0);
  let patches = 0;
  const log: { offset: number; len: number }[] = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Upload-Offset': String(stored.length),
        'Upload-Length': String(opts.size),
        'Tus-Resumable': '1.0.0',
      });
      return void res.end();
    }
    const offset = Number(req.headers['upload-offset']);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      patches++;
      const fault = opts.faults?.({ n: patches, offset });
      if (fault === '503') return void res.writeHead(503).end();
      if (fault === '404') return void res.writeHead(404).end();
      if (offset !== stored.length) return void res.writeHead(409).end();
      const body = Buffer.concat(chunks);
      if (fault === 'cut') {
        // the network drops mid-chunk: half of the data is persisted, the client never gets an answer
        stored = Buffer.concat([stored, body.subarray(0, body.length >> 1)]);
        return void req.socket.destroy();
      }
      stored = Buffer.concat([stored, body]);
      log.push({ offset, len: body.length });
      res
        .writeHead(204, { 'Upload-Offset': String(stored.length), 'Tus-Resumable': '1.0.0' })
        .end();
    });
  });
  return new Promise<{
    url: string;
    stored: () => Buffer;
    log: typeof log;
    patches: () => number;
    close: () => void;
  }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/files/abc`,
        stored: () => stored,
        log,
        patches: () => patches,
        close: () => server.close(),
      });
    }),
  );
}

function memorySource(data: Buffer): ChunkSource {
  return { size: data.length, read: async (o, l) => new Uint8Array(data.subarray(o, o + l)) };
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const noSleep = async () => {};

it('uploads a large file in chunks and reports progress', async () => {
  const data = Buffer.alloc(40 * MiB + 12345, 7);
  const srv = await startServer({ size: data.length });
  const progress: number[] = [];
  await tusUpload({
    fetchFn: nodeFetch,
    uploadUrl: srv.url,
    source: memorySource(data),
    chunkSize: 8 * MiB,
    onProgress: (s) => progress.push(s),
    sleep: noSleep,
  });
  expect(sha(srv.stored())).toBe(sha(data));
  expect(srv.log.length).toBe(6);
  expect(progress.at(-1)).toBe(data.length);
  expect(progress).toEqual([...progress].sort((a, b) => a - b));
  srv.close();
});

it('survives network cuts and 503s mid-upload without losing or duplicating bytes (simulated 50 min video)', async () => {
  // ~64 MiB stands in for a 50-minute recording; the first cut lands mid-chunk, later ones after progress.
  const data = Buffer.alloc(64 * MiB);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 0xff;
  const faults: Record<number, 'cut' | '503'> = { 3: 'cut', 4: '503', 6: 'cut', 7: 'cut' };
  const srv = await startServer({ size: data.length, faults: ({ n }) => faults[n] ?? null });
  await tusUpload({
    fetchFn: nodeFetch,
    uploadUrl: srv.url,
    source: memorySource(data),
    chunkSize: 8 * MiB,
    sleep: noSleep,
  });
  expect(srv.stored().length).toBe(data.length);
  expect(sha(srv.stored())).toBe(sha(data));
  expect(srv.patches()).toBeGreaterThan(srv.log.length); // retries really happened
  srv.close();
}, 60_000);

it('resumes a second run from the server offset after the app was killed', async () => {
  const data = Buffer.alloc(24 * MiB, 3);
  const srv = await startServer({ size: data.length });
  const ac = new AbortController();
  await expect(
    tusUpload({
      fetchFn: nodeFetch,
      uploadUrl: srv.url,
      source: memorySource(data),
      chunkSize: 8 * MiB,
      signal: ac.signal,
      onProgress: (sent) => sent >= 8 * MiB && ac.abort(),
      sleep: noSleep,
    }),
  ).rejects.toThrow('aborted');
  const firstRun = srv.stored().length;
  expect(firstRun).toBeGreaterThanOrEqual(8 * MiB);
  expect(firstRun).toBeLessThan(data.length);

  await tusUpload({
    fetchFn: nodeFetch,
    uploadUrl: srv.url,
    source: memorySource(data),
    chunkSize: 8 * MiB,
    sleep: noSleep,
  });
  expect(sha(srv.stored())).toBe(sha(data));
  expect(srv.log[0]!.offset).toBe(0);
  expect(srv.log.some((l) => l.offset === firstRun)).toBe(true); // second run continued where the first stopped
  srv.close();
});

it('stops with a fatal error when the upload URL has expired', async () => {
  const srv = await startServer({ size: 16 * MiB, faults: () => '404' });
  await expect(
    tusUpload({
      fetchFn: nodeFetch,
      uploadUrl: srv.url,
      source: memorySource(Buffer.alloc(16 * MiB)),
      chunkSize: 8 * MiB,
      sleep: noSleep,
    }),
  ).rejects.toBeInstanceOf(TusFatalError);
  srv.close();
});

it('pauses (retry exhausted) when the network never comes back, keeping progress for a later resume', async () => {
  const srv = await startServer({ size: 16 * MiB, faults: ({ n }) => (n >= 2 ? 'cut' : null) });
  const err = await tusUpload({
    fetchFn: nodeFetch,
    uploadUrl: srv.url,
    source: memorySource(Buffer.alloc(16 * MiB, 1)),
    chunkSize: 8 * MiB,
    maxConsecutiveFailures: 3,
    sleep: noSleep,
  }).catch((e) => e);
  expect(err).toBeInstanceOf(TusRetryExhausted);
  expect(srv.stored().length).toBeGreaterThanOrEqual(8 * MiB);
  srv.close();
});

it('rejects chunk sizes that Cloudflare would refuse', async () => {
  await expect(
    tusUpload({
      fetchFn: nodeFetch,
      uploadUrl: 'http://x',
      source: memorySource(Buffer.alloc(1)),
      chunkSize: 1000,
    }),
  ).rejects.toThrow('256 KiB');
});

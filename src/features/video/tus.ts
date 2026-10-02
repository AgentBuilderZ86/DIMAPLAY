/**
 * Minimal resumable-upload client for the tus 1.0.0 protocol (HEAD to find the offset, PATCH to send
 * chunks). It survives network cuts, 5xx answers and app restarts: any failure re-synchronises with
 * the server offset, so nothing already stored is sent twice. Chunk size must be a multiple of 256 KiB
 * for Cloudflare Stream.
 */
export interface ChunkSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface TusOptions {
  uploadUrl: string;
  source: ChunkSource;
  chunkSize?: number;
  fetchFn?: typeof fetch;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
  /** Consecutive failed attempts (without progress) before giving up; the job can be resumed later. */
  maxConsecutiveFailures?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

export class TusFatalError extends Error {
  constructor(
    readonly reason: 'expired' | 'rejected',
    message: string,
  ) {
    super(message);
    this.name = 'TusFatalError';
  }
}

export class TusRetryExhausted extends Error {
  constructor(readonly offset: number) {
    super(`upload paused at byte ${offset}: network keeps failing`);
    this.name = 'TusRetryExhausted';
  }
}

export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 32 x 256 KiB

const TUS = { 'Tus-Resumable': '1.0.0' };
const defaultBackoff = (attempt: number) => Math.min(30_000, 500 * 2 ** attempt);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function abortError(): Error {
  const e = new Error('upload aborted');
  e.name = 'AbortError';
  return e;
}

export async function tusUpload(o: TusOptions): Promise<void> {
  const doFetch = o.fetchFn ?? fetch;
  const chunkSize = o.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxFailures = o.maxConsecutiveFailures ?? 8;
  const backoff = o.backoffMs ?? defaultBackoff;
  const sleep = o.sleep ?? defaultSleep;
  const total = o.source.size;
  if (chunkSize % (256 * 1024) !== 0) throw new Error('chunkSize must be a multiple of 256 KiB');

  const check = () => {
    if (o.signal?.aborted) throw abortError();
  };

  const fatalOrRetry = (status: number): never | void => {
    if (status === 404 || status === 410 || status === 403) {
      throw new TusFatalError('expired', `upload URL no longer valid (${status})`);
    }
    if (
      status >= 400 &&
      status < 500 &&
      status !== 409 &&
      status !== 423 &&
      status !== 429 &&
      status !== 408
    ) {
      throw new TusFatalError('rejected', `upload rejected (${status})`);
    }
  };

  async function headOffset(): Promise<number> {
    const res = await doFetch(o.uploadUrl, { method: 'HEAD', headers: TUS, signal: o.signal });
    if (!res.ok) {
      fatalOrRetry(res.status);
      throw new Error(`head_${res.status}`);
    }
    const offset = Number(res.headers.get('Upload-Offset'));
    if (!Number.isInteger(offset) || offset < 0 || offset > total)
      throw new Error('bad_upload_offset');
    return offset;
  }

  async function patch(offset: number): Promise<number> {
    const length = Math.min(chunkSize, total - offset);
    const body = await o.source.read(offset, length);
    const res = await doFetch(o.uploadUrl, {
      method: 'PATCH',
      headers: {
        ...TUS,
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: body as unknown as BodyInit,
      signal: o.signal,
    });
    if (res.status !== 204 && res.status !== 200) {
      fatalOrRetry(res.status);
      throw new Error(`patch_${res.status}`);
    }
    const next = Number(res.headers.get('Upload-Offset'));
    if (!Number.isInteger(next) || next < offset || next > total)
      throw new Error('bad_upload_offset');
    return next;
  }

  let failures = 0;
  let offset: number | null = null;
  for (;;) {
    check();
    try {
      if (offset === null) offset = await headOffset();
      if (offset >= total) {
        o.onProgress?.(total, total);
        return;
      }
      const next = await patch(offset);
      if (next > offset) failures = 0;
      offset = next;
      o.onProgress?.(offset, total);
    } catch (e) {
      if (e instanceof TusFatalError || (e as Error).name === 'AbortError') throw e;
      failures++;
      if (failures > maxFailures) throw new TusRetryExhausted(offset ?? 0);
      await sleep(backoff(failures));
      offset = null; // re-synchronise with what the server actually stored
    }
  }
}

import { TusFatalError, TusRetryExhausted, type ChunkSource } from '@/features/video/tus';
import { UploadQueue, type JobStore, type UploadJob } from '@/features/video/uploadQueue';

function memoryStore(): JobStore & { data: UploadJob[] } {
  const s = {
    data: [] as UploadJob[],
    async load() {
      return JSON.parse(JSON.stringify(s.data)) as UploadJob[];
    },
    async save(jobs: UploadJob[]) {
      s.data = JSON.parse(JSON.stringify(jobs)) as UploadJob[];
    },
  };
  return s;
}
const source: ChunkSource = { size: 1000, read: async () => new Uint8Array(0) };

function makeQueue(
  store: JobStore,
  over: Partial<ConstructorParameters<typeof UploadQueue>[0]> = {},
) {
  const calls = { url: 0, finish: 0, upload: 0 };
  const queue = new UploadQueue({
    store,
    getUploadUrl: async () => {
      calls.url++;
      return 'https://upload.example/u1';
    },
    openSource: async () => source,
    finishUpload: async () => void calls.finish++,
    upload: async (o) => {
      calls.upload++;
      o.onProgress?.(1000, 1000);
    },
    ...over,
  });
  return { queue, calls };
}
const job = { videoId: 'v1', localUri: 'file:///v1.mov', sizeBytes: 1000 };

it('uploads, tells the backend, and marks the job done', async () => {
  const store = memoryStore();
  const { queue, calls } = makeQueue(store);
  await queue.enqueue(job);
  await queue.run();
  expect(calls).toEqual({ url: 1, finish: 1, upload: 1 });
  expect((await queue.list())[0]).toMatchObject({
    state: 'done',
    sentBytes: 1000,
    uploadUrl: 'https://upload.example/u1',
  });
  expect(store.data[0]!.state).toBe('done');
});

it('pauses when the network is lost and finishes on the next run without asking for a new URL', async () => {
  const store = memoryStore();
  let attempt = 0;
  const { queue, calls } = makeQueue(store, {
    upload: async (o) => {
      attempt++;
      if (attempt === 1) throw new TusRetryExhausted(400);
      o.onProgress?.(1000, 1000);
    },
  });
  await queue.enqueue(job);
  await queue.run();
  expect((await queue.list())[0]).toMatchObject({ state: 'paused', sentBytes: 400 });
  expect(calls.finish).toBe(0);

  await queue.run(); // back online
  expect((await queue.list())[0]!.state).toBe('done');
  expect(calls.url).toBe(1); // same URL reused: the server resumes from its offset
  expect(calls.finish).toBe(1);
});

it('resumes after the app was killed mid-upload', async () => {
  const store = memoryStore();
  store.data = [
    {
      ...job,
      state: 'uploading',
      sentBytes: 300,
      uploadUrl: 'https://upload.example/u1',
      updatedAt: 1,
    },
  ];
  const { queue, calls } = makeQueue(store);
  await queue.run(); // a brand-new queue instance, as after a restart
  expect((await queue.list())[0]!.state).toBe('done');
  expect(calls.url).toBe(0);
  expect(calls.finish).toBe(1);
});

it('marks expired uploads as failed and lets the user retry them', async () => {
  const store = memoryStore();
  let fail = true;
  const { queue, calls } = makeQueue(store, {
    upload: async (o) => {
      if (fail) throw new TusFatalError('expired', 'gone');
      o.onProgress?.(1000, 1000);
    },
  });
  await queue.enqueue(job);
  await queue.run();
  expect((await queue.list())[0]).toMatchObject({ state: 'failed', error: 'expired' });
  await queue.run();
  expect(calls.finish).toBe(0); // failed jobs are not retried automatically

  fail = false;
  await queue.retry('v1');
  await queue.run();
  expect((await queue.list())[0]!.state).toBe('done');
});

it('keeps a job paused (not lost) when the backend call fails', async () => {
  const store = memoryStore();
  let ok = false;
  const { queue } = makeQueue(store, {
    getUploadUrl: async () => {
      if (!ok) throw new Error('offline');
      return 'https://upload.example/u1';
    },
  });
  await queue.enqueue(job);
  await queue.run();
  expect((await queue.list())[0]).toMatchObject({ state: 'paused', error: 'offline' });
  ok = true;
  await queue.run();
  expect((await queue.list())[0]!.state).toBe('done');
});

it('ignores duplicate enqueues and concurrent run() calls', async () => {
  const { queue, calls } = makeQueue(memoryStore());
  await queue.enqueue(job);
  await queue.enqueue(job);
  await Promise.all([queue.run(), queue.run()]);
  expect(calls.upload).toBe(1);
  expect(await queue.list()).toHaveLength(1);
});

it('forgets finished jobs after a day but keeps unfinished ones', async () => {
  const store = memoryStore();
  const now = 10 * 24 * 3600 * 1000;
  store.data = [
    {
      ...job,
      videoId: 'old',
      state: 'done',
      sentBytes: 1000,
      updatedAt: now - 2 * 24 * 3600 * 1000,
    },
    { ...job, videoId: 'recent', state: 'done', sentBytes: 1000, updatedAt: now - 3600 * 1000 },
    {
      ...job,
      videoId: 'stuck',
      state: 'paused',
      sentBytes: 10,
      updatedAt: now - 5 * 24 * 3600 * 1000,
    },
  ];
  const { queue } = makeQueue(store, { now: () => now });
  expect((await queue.list()).map((j) => j.videoId).sort()).toEqual(['recent', 'stuck']);
});

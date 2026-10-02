import {
  TusFatalError,
  TusRetryExhausted,
  tusUpload,
  type ChunkSource,
  type TusOptions,
} from './tus';

export type UploadState = 'pending' | 'uploading' | 'paused' | 'done' | 'failed';

export interface UploadJob {
  videoId: string;
  localUri: string;
  sizeBytes: number;
  uploadUrl?: string;
  state: UploadState;
  sentBytes: number;
  error?: string;
  updatedAt: number;
}

export interface JobStore {
  load(): Promise<UploadJob[]>;
  save(jobs: UploadJob[]): Promise<void>;
}

export interface QueueDeps {
  store: JobStore;
  /** Asks the backend for the (idempotent) resumable upload URL. */
  getUploadUrl(videoId: string, sizeBytes: number): Promise<string>;
  openSource(localUri: string): Promise<ChunkSource>;
  /** Tells the backend the bytes are all there (idempotent). */
  finishUpload(videoId: string): Promise<void>;
  upload?: (o: TusOptions) => Promise<void>;
  now?: () => number;
}

type Listener = (jobs: UploadJob[]) => void;

/**
 * Persistent, sequential upload queue. Jobs survive app restarts (stored on disk) and resume from
 * the server-side offset; a job that loses the network is "paused" and picked up again by the next
 * `run()` (app start, back online, back to foreground).
 */
export class UploadQueue {
  private jobs: UploadJob[] = [];
  private loaded = false;
  private running = false;
  private listeners = new Set<Listener>();
  private readonly upload: (o: TusOptions) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly deps: QueueDeps) {
    this.upload = deps.upload ?? tusUpload;
    this.now = deps.now ?? Date.now;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  async list(): Promise<UploadJob[]> {
    await this.ensureLoaded();
    return this.jobs.map((j) => ({ ...j }));
  }

  async enqueue(job: Pick<UploadJob, 'videoId' | 'localUri' | 'sizeBytes'>): Promise<void> {
    await this.ensureLoaded();
    if (this.jobs.some((j) => j.videoId === job.videoId)) return;
    this.jobs.push({ ...job, state: 'pending', sentBytes: 0, updatedAt: this.now() });
    await this.persist();
  }

  /** Retries a failed job from scratch (new request to the backend). */
  async retry(videoId: string): Promise<void> {
    await this.ensureLoaded();
    const job = this.jobs.find((j) => j.videoId === videoId);
    if (job && job.state === 'failed') {
      Object.assign(job, { state: 'pending', error: undefined, updatedAt: this.now() });
      await this.persist();
    }
  }

  /** Processes every pending/paused job once. Safe to call repeatedly; concurrent calls are ignored. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureLoaded();
      for (const job of this.jobs) {
        if (job.state === 'done' || job.state === 'failed') continue;
        await this.process(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(job: UploadJob): Promise<void> {
    try {
      this.update(job, { state: 'uploading' });
      if (!job.uploadUrl) {
        const uploadUrl = await this.deps.getUploadUrl(job.videoId, job.sizeBytes);
        this.update(job, { uploadUrl });
        await this.persist();
      }
      const source = await this.deps.openSource(job.localUri);
      let lastSaved = 0;
      await this.upload({
        uploadUrl: job.uploadUrl!,
        source,
        onProgress: (sent) => {
          job.sentBytes = sent;
          this.emit();
          // Persist roughly every 5 % so a crash costs little, without hammering the disk.
          if (sent - lastSaved >= job.sizeBytes / 20) {
            lastSaved = sent;
            void this.persist();
          }
        },
      });
      await this.deps.finishUpload(job.videoId);
      this.update(job, { state: 'done', sentBytes: job.sizeBytes, error: undefined });
    } catch (e) {
      if (e instanceof TusFatalError) {
        this.update(job, { state: 'failed', error: e.reason });
      } else if (e instanceof TusRetryExhausted || (e as Error).name === 'AbortError') {
        this.update(job, {
          state: 'paused',
          sentBytes: (e as TusRetryExhausted).offset ?? job.sentBytes,
        });
      } else {
        // Backend/URL/file errors are retried by the next run() unless they keep happening.
        this.update(job, { state: 'paused', error: (e as Error).message });
      }
    }
    await this.persist();
  }

  private update(job: UploadJob, patch: Partial<UploadJob>): void {
    Object.assign(job, patch, { updatedAt: this.now() });
    this.emit();
  }

  private emit(): void {
    const snapshot = this.jobs.map((j) => ({ ...j }));
    this.listeners.forEach((l) => l(snapshot));
  }

  private async persist(): Promise<void> {
    await this.deps.store.save(this.jobs);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const dayAgo = this.now() - 24 * 3600 * 1000;
    this.jobs = (await this.deps.store.load())
      .filter((j) => j.state !== 'done' || j.updatedAt > dayAgo) // forget old finished jobs
      .map((j) =>
        // a job interrupted mid-upload by an app kill resumes as paused
        j.state === 'uploading' ? { ...j, state: 'paused' as const } : j,
      );
    this.loaded = true;
  }
}

import { File, FileMode, Paths } from 'expo-file-system';

import type { JobStore, UploadJob } from './uploadQueue';
import type { ChunkSource } from './tus';

/** Reads byte ranges from a local video without loading the whole (multi-GB) file in memory. */
export async function openFileSource(uri: string): Promise<ChunkSource> {
  const file = new File(uri);
  const size = file.size;
  if (!file.exists || !size) throw new Error('video_file_missing');
  return {
    size,
    async read(offset: number, length: number): Promise<Uint8Array> {
      const handle = file.open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        return handle.readBytes(length);
      } finally {
        handle.close();
      }
    },
  };
}

/** JSON file in the app's document directory (backed up with the device, never synced to us). */
export function fileJobStore(name = 'upload-queue.json'): JobStore {
  const file = () => new File(Paths.document, name);
  return {
    async load(): Promise<UploadJob[]> {
      const f = file();
      if (!f.exists) return [];
      try {
        return JSON.parse(await f.text()) as UploadJob[];
      } catch {
        return [];
      }
    },
    async save(jobs: UploadJob[]): Promise<void> {
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(jobs));
    },
  };
}

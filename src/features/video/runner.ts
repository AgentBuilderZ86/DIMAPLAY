import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

import { fileJobStore, openFileSource } from './fileSource';
import { UploadQueue, type UploadJob } from './uploadQueue';

export const uploadQueue = new UploadQueue({
  store: fileJobStore(),
  openSource: openFileSource,
  async getUploadUrl(videoId, sizeBytes) {
    const { data, error } = await supabase.functions.invoke('create-upload', {
      body: { video_id: videoId, size_bytes: sizeBytes },
    });
    const url = (data as { upload_url?: string } | null)?.upload_url;
    if (error || !url) throw new Error('create_upload_failed');
    return url;
  },
  async finishUpload(videoId) {
    const { error } = await supabase.rpc('finish_upload', { p_video: videoId });
    if (error) throw error;
  },
});

/** Resumes pending uploads at launch, when the network comes back, and when the app returns to the foreground. */
export function useUploadRunner(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void uploadQueue.run();
    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) void uploadQueue.run();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void uploadQueue.run();
    });
    return () => {
      net();
      app.remove();
    };
  }, [enabled]);
}

export function useUploadJobs(): UploadJob[] {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  useEffect(() => {
    let alive = true;
    void uploadQueue.list().then((j) => alive && setJobs(j));
    const off = uploadQueue.subscribe((j) => alive && setJobs(j));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return jobs;
}

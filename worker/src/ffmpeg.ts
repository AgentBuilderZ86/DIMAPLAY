import { spawn } from 'node:child_process';

export interface VerticalClipJob {
  /** Local path or HTTPS URL of the original video (range requests make remote seeking cheap). */
  input: string;
  startSeconds: number;
  durationSeconds: number;
  output: string;
}

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;

/**
 * Cuts [start, start + duration] and renders it as a 9:16 clip. The whole pitch stays visible: the
 * original is scaled to fit and centred over a blurred, zoomed copy of itself (no action is cropped
 * out, unlike a centre crop of a landscape match recording).
 */
export function buildVerticalClipArgs(j: VerticalClipJob): string[] {
  const w = OUTPUT_WIDTH;
  const h = OUTPUT_HEIGHT;
  const filter = [
    '[0:v]split=2[bg][fg]',
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=30[bgb]`,
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs]`,
    '[bgb][fgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]',
  ].join(';');
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    j.startSeconds.toFixed(3),
    '-i',
    j.input,
    '-t',
    j.durationSeconds.toFixed(3),
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    j.output,
  ];
}

export function runFfmpeg(args: string[], timeoutMs = 5 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}

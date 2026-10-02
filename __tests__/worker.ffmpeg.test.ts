/**
 * @jest-environment node
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildVerticalClipArgs, runFfmpeg } from '../worker/src/ffmpeg';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const probe = (file: string) => {
  const out = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,width,height,duration',
    '-of',
    'json',
    file,
  ]);
  const streams = JSON.parse(out.stdout.toString()).streams as {
    codec_type: string;
    width?: number;
    height?: number;
    duration?: string;
  }[];
  const video = streams.find((s) => s.codec_type === 'video')!;
  return {
    width: video.width,
    height: video.height,
    duration: Number(video.duration),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
};

describe('buildVerticalClipArgs', () => {
  it('seeks before the input and caps the duration', () => {
    const args = buildVerticalClipArgs({
      input: 'https://x/o.mp4',
      startSeconds: 292,
      durationSeconds: 12,
      output: 'o.mp4',
    });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('292.000');
    expect(args[args.indexOf('-t') + 1]).toBe('12.000');
    expect(args.join(' ')).toContain('scale=1080:1920');
    expect(args.at(-1)).toBe('o.mp4');
  });
});

(hasFfmpeg ? describe : describe.skip)('real ffmpeg rendering', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp-ffmpeg-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const makeSource = (name: string, size: string) => {
    const file = join(dir, name);
    const r = spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=${size}:rate=30:duration=30`,
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      file,
    ]);
    expect(r.status).toBe(0);
    return file;
  };

  it('turns a landscape match recording into a 1080x1920 clip of the requested length, with sound', async () => {
    const input = makeSource('match.mp4', '1920x1080');
    const output = join(dir, 'clip.mp4');
    await runFfmpeg(
      buildVerticalClipArgs({ input, startSeconds: 10, durationSeconds: 12, output }),
    );
    const info = probe(output);
    expect(info.width).toBe(1080);
    expect(info.height).toBe(1920);
    expect(info.duration).toBeGreaterThan(11.5);
    expect(info.duration).toBeLessThan(12.5);
    expect(info.hasAudio).toBe(true);
    expect(statSync(output).size).toBeGreaterThan(10_000);
  }, 60_000);

  it('handles a clip that starts at 0 (moment in the first seconds) and a portrait source', async () => {
    const input = makeSource('portrait.mp4', '720x1280');
    const output = join(dir, 'clip0.mp4');
    await runFfmpeg(buildVerticalClipArgs({ input, startSeconds: 0, durationSeconds: 7, output }));
    const info = probe(output);
    expect([info.width, info.height]).toEqual([1080, 1920]);
    expect(info.duration).toBeGreaterThan(6.5);
    expect(info.duration).toBeLessThan(7.5);
  }, 60_000);

  it('reports ffmpeg failures with the error output', async () => {
    await expect(
      runFfmpeg(
        buildVerticalClipArgs({
          input: join(dir, 'missing.mp4'),
          startSeconds: 0,
          durationSeconds: 5,
          output: join(dir, 'x.mp4'),
        }),
      ),
    ).rejects.toThrow(/ffmpeg exited/);
  });
});

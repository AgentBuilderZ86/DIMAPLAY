/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { MOMENTS_BY_SPORT, formatClock } from '@/features/video/moments';

it('keeps the app moment list in sync with the database rule', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20261004000001_video_clips.sql'),
    'utf8',
  );
  const fn = sql.slice(
    sql.indexOf('create function public.moment_type_ok'),
    sql.indexOf('create table public.videos'),
  );
  for (const [sport, moments] of Object.entries(MOMENTS_BY_SPORT)) {
    const line = fn.split('\n').find((l) => l.includes(`s = '${sport}'`))!;
    const inList = [...line.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).filter((x) => x !== sport);
    expect(inList.sort()).toEqual([...moments].sort());
  }
});

it('formats the recording clock', () => {
  expect(formatClock(0)).toBe('00:00');
  expect(formatClock(65.9)).toBe('01:05');
  expect(formatClock(3725)).toBe('1:02:05');
  expect(formatClock(-3)).toBe('00:00');
});

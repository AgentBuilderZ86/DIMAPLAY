export type Lang = 'fr' | 'ar' | 'en';

const MESSAGES: Record<Lang, { title: string; body: string }> = {
  fr: { title: 'Tes clips sont prêts', body: 'Mabrouk ! Retrouve et partage tes moments forts.' },
  en: { title: 'Your clips are ready', body: 'Mabrouk! Find and share your highlights.' },
  ar: { title: 'مقاطعك جاهزة', body: 'مبروك! اعثر على لحظاتك المميزة وشاركها.' },
};

export interface PushTarget {
  token: string;
  language: Lang;
}

/** Sends the "clips ready" notification through the Expo push service. Returns the number accepted. */
export async function sendClipsReady(
  targets: PushTarget[],
  data: { matchId: string },
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  if (targets.length === 0) return 0;
  const messages = targets.map((t) => ({
    to: t.token,
    sound: 'default',
    ...MESSAGES[t.language],
    data: { type: 'clips_ready', matchId: data.matchId },
  }));
  const res = await fetchFn('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`expo_push_${res.status}`);
  const body = (await res.json()) as { data?: { status: string }[] };
  return (body.data ?? []).filter((r) => r.status === 'ok').length;
}

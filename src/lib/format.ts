/** Locale-aware short date+time, e.g. "jeu. 2 oct., 21:00". */
export function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatElo(elo: number): string {
  return Math.round(elo).toString();
}

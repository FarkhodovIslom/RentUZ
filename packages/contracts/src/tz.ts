/**
 * Tashkent day-boundary helpers (6_Phase.md §5 trap: server + web must bucket
 * "Bugun/Kecha/Oldin" identically). Native Date math only — contracts stay
 * dependency-free. Uzbekistan has been UTC+5 with no DST since 1992.
 */
export const TASHKENT_UTC_OFFSET_MINUTES = 300;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Ordinal day number in Asia/Tashkent for a UTC epoch (2026-09-12 → N). */
export function tashkentDayNumber(epochMs: number): number {
  return Math.floor((epochMs + TASHKENT_UTC_OFFSET_MINUTES * MINUTE_MS) / DAY_MS);
}

export type TashkentDayBucketT = 'bugun' | 'kecha' | 'oldin';

/**
 * Bucket a UTC timestamp into the notification page's sections, evaluated
 * against an explicit `now` (callers pass Date.now()) so tests can fix time.
 * Buckets follow the Tashkent calendar: 01:00 Tashkent is already "bugun"
 * even though UTC still shows the previous day.
 */
export function tashkentDayBucket(nowMs: number, atMs: number): TashkentDayBucketT {
  const delta = tashkentDayNumber(nowMs) - tashkentDayNumber(atMs);
  if (delta <= 0) return 'bugun';
  if (delta === 1) return 'kecha';
  return 'oldin';
}

/** UTC epoch (ms) of the most recent Tashkent midnight — the "today" start. */
export function tashkentMidnightUtc(nowMs: number): number {
  return tashkentDayNumber(nowMs) * DAY_MS - TASHKENT_UTC_OFFSET_MINUTES * MINUTE_MS;
}

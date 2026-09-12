import { describe, expect, it } from 'vitest';
import { tashkentDayBucket, tashkentDayNumber, tashkentMidnightUtc } from './tz.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

/** 2026-09-12 00:00 Tashkent = 2026-09-11 19:00 UTC. */
const TAK_DAY_START_UTC = Date.UTC(2026, 8, 11, 19, 0, 0);

describe('tashkentDayNumber', () => {
  it('rolls to the next ordinal at 19:00 UTC (00:00 Tashkent)', () => {
    expect(tashkentDayNumber(TAK_DAY_START_UTC)).toBe(
      tashkentDayNumber(TAK_DAY_START_UTC + 1),
    );
    expect(tashkentDayNumber(TAK_DAY_START_UTC - MIN)).toBe(tashkentDayNumber(TAK_DAY_START_UTC) - 1);
  });
});

describe('tashkentMidnightUtc', () => {
  it('returns the UTC epoch of the current Tashkent midnight', () => {
    expect(tashkentMidnightUtc(TAK_DAY_START_UTC)).toBe(TAK_DAY_START_UTC);
    expect(tashkentMidnightUtc(TAK_DAY_START_UTC + DAY - MIN)).toBe(TAK_DAY_START_UTC);
    expect(tashkentMidnightUtc(TAK_DAY_START_UTC - MIN)).toBe(TAK_DAY_START_UTC - DAY);
  });
});

describe('tashkentDayBucket', () => {
  const now = TAK_DAY_START_UTC + 8 * 60 * MIN; // noon 2026-09-12 Tashkent

  it('buckets by Tashkent, not UTC: 01:00 today is "bugun" though UTC is still yesterday (6_Phase.md §5)', () => {
    const todayEarlyMorning = TAK_DAY_START_UTC + 60 * MIN; // 01:00 Tashkent
    expect(tashkentDayBucket(now, todayEarlyMorning)).toBe('bugun');
    expect(new Date(todayEarlyMorning).toISOString().slice(0, 10)).toBe('2026-09-11');
  });

  it('23:30 on the current Tashkent day is "bugun" even at 18:30 UTC', () => {
    const todayLateEvening = TAK_DAY_START_UTC + DAY - 30 * MIN; // 23:30 Tashkent
    expect(tashkentDayBucket(now, todayLateEvening)).toBe('bugun');
  });

  it('one minute before Tashkent midnight yesterday is "kecha"', () => {
    expect(tashkentDayBucket(now, TAK_DAY_START_UTC - MIN)).toBe('kecha');
  });

  it('older than one Tashkent day boundary back is "oldin"', () => {
    expect(tashkentDayBucket(now, TAK_DAY_START_UTC - DAY - MIN)).toBe('oldin');
  });

  it('future timestamps never land in "kecha"/"oldin"', () => {
    expect(tashkentDayBucket(now, now + DAY)).toBe('bugun');
  });
});

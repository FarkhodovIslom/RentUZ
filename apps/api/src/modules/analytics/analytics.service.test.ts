import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { resolveAnalyticsRange } from './analytics.service.js';

const DAY_MS = 86_400_000;
// 2026-09-12 12:00 Tashkent = 07:00 UTC
const NOW = Date.UTC(2026, 8, 12, 7, 0, 0);
// Today's Tashkent midnight = 2026-09-11 19:00 UTC
const TODAY_START = Date.UTC(2026, 8, 11, 19, 0, 0);

describe('resolveAnalyticsRange', () => {
  it('7d preset covers 7 Tashkent days ending at today (rollup path)', () => {
    const r = resolveAnalyticsRange({ range: '7d' }, NOW);
    expect(r.fromRollup).toBe(true);
    expect(r.days).toBe(7);
    expect(r.startMs).toBe(TODAY_START - 6 * DAY_MS);
    expect(r.endMs).toBe(TODAY_START + DAY_MS);
    expect(r.granularity).toBe('day');
  });

  it('90d is day granularity, custom >90 switches to week', () => {
    expect(resolveAnalyticsRange({ range: '90d' }, NOW).granularity).toBe('day');
    const custom = resolveAnalyticsRange(
      { range: 'custom', from: '2025-10-01', to: '2026-09-01' },
      NOW,
    );
    expect(custom.granularity).toBe('week');
  });

  it('custom ranges clamp backwards to 365 days and never past today', () => {
    const r = resolveAnalyticsRange(
      { range: 'custom', from: '2000-01-01', to: '2099-12-31' },
      NOW,
    );
    expect(r.days).toBeLessThanOrEqual(366);
    expect(r.endMs).toBe(TODAY_START + DAY_MS); // future `to` capped to today
    expect(r.fromRollup).toBe(false);
  });

  it('rejects inverted ranges with a 400, not a 500', () => {
    expect(() =>
      resolveAnalyticsRange({ range: 'custom', from: '2026-09-10', to: '2026-09-01' }, NOW),
    ).toThrow(BadRequestException);
  });

  it('custom `to` is inclusive of that day', () => {
    const r = resolveAnalyticsRange({ range: 'custom', from: '2026-09-10', to: '2026-09-12' }, NOW);
    expect(r.days).toBe(3);
    expect(r.endMs).toBe(TODAY_START + DAY_MS);
  });
});

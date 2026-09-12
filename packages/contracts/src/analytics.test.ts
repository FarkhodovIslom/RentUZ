import { describe, expect, it } from 'vitest';
import { AnalyticsQuery, AnalyticsRange, OwnerAnalyticsResponse } from './analytics.js';

describe('AnalyticsQuery', () => {
  it('defaults to 30d', () => {
    expect(AnalyticsQuery.parse({}).range).toBe('30d');
  });

  it('accepts the four range buckets', () => {
    expect(AnalyticsRange.options).toEqual(['7d', '30d', '90d', 'custom']);
  });

  it('requires from+to only for custom', () => {
    expect(AnalyticsQuery.safeParse({ range: '7d' }).success).toBe(true);
    expect(AnalyticsQuery.safeParse({ range: 'custom' }).success).toBe(false);
    expect(AnalyticsQuery.safeParse({ range: 'custom', from: '2026-08-01', to: '2026-09-01' }).success).toBe(true);
  });

  it('keeps dates as YYYY-MM-DD strings — never Date objects (0_Phase §1 trap 12)', () => {
    const parsed = AnalyticsQuery.parse({ range: 'custom', from: '2026-08-01', to: '2026-09-01' });
    expect(typeof parsed.from).toBe('string');
    expect(AnalyticsQuery.safeParse({ range: 'custom', from: '2026-8-1', to: '2026-09-01' }).success).toBe(false);
    expect(AnalyticsQuery.safeParse({ range: 'custom', from: 'not-a-date', to: '2026-09-01' }).success).toBe(false);
  });
});

describe('OwnerAnalyticsResponse', () => {
  it('validates overview + day-granularity series + top properties', () => {
    const ok = OwnerAnalyticsResponse.safeParse({
      overview: { views: 10, favorites: 2, messages: 3, requests: 4, conversion: 0.25 },
      granularity: 'day',
      series: [{ date: '2026-09-12', views: 10, favorites: 2, messages: 3, requests: 4, accepted: 1 }],
      topProperties: [
        { propertyId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', title: 'Uy', slug: 'uy', mainImageUrl: null, views: 10, favorites: 2 },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects conversion outside 0..1', () => {
    expect(
      OwnerAnalyticsResponse.safeParse({
        overview: { views: 0, favorites: 0, messages: 0, requests: 0, conversion: 1.5 },
        granularity: 'day',
        series: [],
        topProperties: [],
      }).success,
    ).toBe(false);
  });
});

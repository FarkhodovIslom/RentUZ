import type { OwnerAnalyticsResponseT } from '@rentuz/contracts';

/**
 * Deterministic "Performance insights" (§34) — plain rules over the analytics
 * payload, NOT ML (that's §82, out of scope). Each insight is a translation
 * key + params the UI renders via next-intl.
 */
export interface Insight {
  key: string;
  params: Record<string, string | number>;
}

/** §34 rules — deterministic, unit-testable; the UI renders each insight via
 *  useTranslations('owner.analytics.insights')(insight.key, insight.params). */
export function computeInsights(a: OwnerAnalyticsResponseT): Insight[] {
  const out: Insight[] = [];
  const { overview, series, topProperties } = a;
  const totalViews = overview.views;
  if (totalViews === 0 && overview.requests === 0) return out;

  // Views trend: second half vs first half of the series.
  if (series.length >= 4) {
    const half = Math.floor(series.length / 2);
    const first = series.slice(0, half).reduce((s, p) => s + p.views, 0);
    const second = series.slice(half).reduce((s, p) => s + p.views, 0);
    if (first > 0) {
      const pct = Math.round(((second - first) / first) * 100);
      if (pct >= 10) out.push({ key: 'viewsUp', params: { percent: pct } });
      else if (pct <= -10) out.push({ key: 'viewsDown', params: { percent: Math.abs(pct) } });
    }
  }

  // Conversion quality.
  if (overview.requests > 0) {
    const pct = Math.round(overview.conversion * 100);
    if (pct >= 50) out.push({ key: 'convHigh', params: { percent: pct } });
    else if (pct < 25) out.push({ key: 'convLow', params: { percent: pct } });
  } else {
    out.push({ key: 'convNone', params: {} });
  }

  // Top property concentration.
  const best = topProperties[0];
  if (best && totalViews > 0 && best.views / totalViews >= 0.4) {
    out.push({ key: 'topShare', params: { title: best.title, percent: Math.round((best.views / totalViews) * 100) } });
  }

  // Best bucket.
  if (series.length > 0) {
    const bestPoint = series.reduce((m, p) => (p.views > m.views ? p : m), series[0]!);
    if (bestPoint.views > 0) {
      out.push({ key: 'bestWeek', params: { week: bestPoint.date, views: bestPoint.views } });
    }
  }
  return out;
}

'use client';

import { useTranslations } from 'next-intl';
import type { OwnerAnalyticsResponseT } from '@rentuz/contracts';
import { computeInsights } from '@/lib/analytics-insights';

/** Deterministic performance-insights panel (§34). Rules live in lib/analytics-insights. */
export function InsightsPanel({ analytics }: { analytics: OwnerAnalyticsResponseT }) {
  const t = useTranslations('owner.analytics');
  const insights = computeInsights(analytics);

  return (
    <section className="rounded-[12px] border border-border bg-card p-4" data-testid="insights-panel">
      <h2 className="mb-2 text-lg font-semibold">{t('insightsTitle')}</h2>
      {insights.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('insights.noData')}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {insights.map((i, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{t(`insights.${i.key}`, i.params)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

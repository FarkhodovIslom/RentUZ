'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AnalyticsRangeT } from '@rentuz/contracts';
import { cn } from '@rentuz/ui/cn';

/** §34 range picker. Emits a resolved query string fragment (range + from/to for custom). */
export function RangeFilter({ onChange }: { onChange: (query: string) => void }) {
  const t = useTranslations('owner.analytics');
  const [range, setRange] = useState<AnalyticsRangeT>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const opts: AnalyticsRangeT[] = ['7d', '30d', '90d', 'custom'];

  const apply = () => {
    if (range === 'custom') {
      if (!from || !to) return;
      onChange(`range=custom&from=${from}&to=${to}`);
    } else {
      onChange(`range=${range}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="range-filter">
      <div className="inline-flex rounded-[12px] border border-border bg-card p-1">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => {
              setRange(o);
              if (o !== 'custom') onChange(`range=${o}`);
            }}
            className={cn(
              'rounded-[8px] px-3 py-1.5 text-sm',
              range === o ? 'bg-primary font-medium text-black' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {t(`range.${o}`)}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t('from')}
            className="rounded-[10px] border border-border bg-input px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t('to')}
            className="rounded-[10px] border border-border bg-input px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={apply}
            className="rounded-[10px] bg-primary px-3 py-1.5 text-sm font-medium text-black hover:bg-primary-hover"
          >
            {t('apply')}
          </button>
        </div>
      )}
    </div>
  );
}

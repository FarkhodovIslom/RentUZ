'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OwnerAnalyticsResponseT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { KpiCard } from '@/components/owner/KpiCard';
import { RangeFilter } from '@/components/owner/RangeFilter';
import { InsightsPanel } from '@/components/owner/InsightsPanel';
import { formatDayTak } from '@/lib/format';

/** §34 owner analytics page: range filter + KPI strip + line + bar charts + insights. */
export function AnalyticsView() {
  const t = useTranslations('owner.analytics');
  const td = useTranslations('owner.dashboard');
  const [query, setQuery] = useState('range=30d');

  const { data, isPending } = useQuery({
    queryKey: ['analytics', 'overview', query],
    queryFn: () => api.get<OwnerAnalyticsResponseT>(`/owner/analytics?${query}`),
  });

  const series = (data?.series ?? []).map((p) => ({
    ...p,
    label: formatDayTak(`${p.date}T00:00:00+05:00`),
  }));
  const top = data?.topProperties ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <RangeFilter onChange={setQuery} />
      </header>

      {isPending || !data ? (
        <p className="text-sm text-fg-muted">…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="analytics-kpis">
            <KpiCard label={td('kpi.views')} value={data.overview.views} />
            <KpiCard label={td('kpi.favorites')} value={data.overview.favorites} />
            <KpiCard label={td('kpi.messages')} value={data.overview.messages} />
            <KpiCard label={td('kpi.requests')} value={data.overview.requests} />
            <KpiCard label={td('kpi.conversion')} value={`${Math.round(data.overview.conversion * 100)}%`} accent />
          </section>

          <section className="rounded-[12px] border border-border bg-card p-4" data-testid="line-chart">
            <h2 className="mb-3 text-sm font-semibold">{t('charts.trend')}</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#ffffff14" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a1f27', border: '1px solid #2a303a', borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="views" name={t('charts.views')} stroke="#ffa31a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="requests" name={t('charts.requests')} stroke="#4d9fff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-[12px] border border-border bg-card p-4" data-testid="bar-chart">
            <h2 className="mb-3 text-sm font-semibold">{t('charts.top')}</h2>
            {top.length === 0 ? (
              <p className="text-sm text-fg-muted">—</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={top.map((p) => ({ name: p.title.length > 18 ? `${p.title.slice(0, 17)}…` : p.title, views: p.views }))}
                    margin={{ top: 6, right: 12, bottom: 0, left: -12 }}
                  >
                    <CartesianGrid stroke="#ffffff14" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8b93a1' }} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      contentStyle={{ background: '#1a1f27', border: '1px solid #2a303a', borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="views" name={t('charts.views')} fill="#ffa31a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <InsightsPanel analytics={data} />
        </>
      )}
    </div>
  );
}

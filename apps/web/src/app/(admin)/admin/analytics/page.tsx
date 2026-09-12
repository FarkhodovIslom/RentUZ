'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAdminAnalytics } from '@/hooks/use-admin';
import { KpiCard } from '@/components/owner/KpiCard';
import { RangeFilter } from '@/components/owner/RangeFilter';
import { formatDayTak } from '@/lib/format';

/** §50/§57 platform-level analytics: same chart language as the owner page. */
export default function AdminAnalyticsPage() {
  const t = useTranslations('admin.analytics');
  const td = useTranslations('admin.dashboard');
  const [range, setRange] = useState('30d');
  const { data } = useAdminAnalytics(range);

  const series = (data?.series ?? []).map((point) => ({
    ...point,
    label: formatDayTak(`${point.date}T00:00:00+05:00`),
  }));
  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <RangeFilter onChange={(query) => setRange(new URLSearchParams(query).get('range') ?? '30d')} />
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={td('totalUsers')} value={kpis?.totalUsers ?? '—'} />
        <KpiCard label={td('activeUsers')} value={kpis?.activeUsers ?? '—'} />
        <KpiCard label={td('totalProperties')} value={kpis?.totalProperties ?? '—'} />
        <KpiCard label={td('activeProperties')} value={kpis?.activeProperties ?? '—'} />
      </section>

      <section className="rounded-[12px] border border-border bg-card p-4" data-testid="admin-analytics-chart">
        <h2 className="mb-3 text-sm font-semibold">{t('series')}</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#ffffff14" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1a1f27', border: '1px solid #2a303a', borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="newUsers" name={t('legend.newUsers')} stroke="#ffa31a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="newProperties" name={t('legend.newProperties')} stroke="#4d9fff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="requests" name={t('legend.requests')} stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

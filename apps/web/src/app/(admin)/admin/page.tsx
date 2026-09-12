'use client';

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
import { useAdminAnalytics, useAdminProperties, useAdminUsers } from '@/hooks/use-admin';
import { KpiCard } from '@/components/owner/KpiCard';
import { formatDayTak } from '@/lib/format';

/** §57 admin overview: KPI cards + 30-day growth chart + recent rows. */
export default function AdminOverviewPage() {
  const t = useTranslations('admin.dashboard');
  const { data: analytics } = useAdminAnalytics('30d');
  const { data: recentUsers } = useAdminUsers({ limit: 5 });
  const { data: recentProperties } = useAdminProperties({ limit: 5 });

  const series = (analytics?.series ?? []).map((point) => ({
    ...point,
    label: formatDayTak(`${point.date}T00:00:00+05:00`),
  }));
  const kpis = analytics?.kpis;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-kpis">
        <KpiCard label={t('totalUsers')} value={kpis?.totalUsers ?? '—'} />
        <KpiCard label={t('activeUsers')} value={kpis?.activeUsers ?? '—'} />
        <KpiCard label={t('totalProperties')} value={kpis?.totalProperties ?? '—'} />
        <KpiCard label={t('activeProperties')} value={kpis?.activeProperties ?? '—'} />
        <KpiCard label={t('pendingVerification')} value={kpis?.pendingVerification ?? '—'} accent />
        <KpiCard label={t('openReports')} value={kpis?.openReports ?? '—'} />
        <KpiCard label={t('rentalRequests')} value={kpis?.rentalRequestsInRange ?? '—'} />
        <KpiCard label={t('revenue')} value={kpis?.revenue ?? 0} />
      </section>

      <section className="rounded-[12px] border border-border bg-card p-4" data-testid="admin-growth-chart">
        <h2 className="mb-3 text-sm font-semibold">{t('growth')}</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#ffffff14" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#8b93a1' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1a1f27', border: '1px solid #2a303a', borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="newUsers" name={t('growthNewUsers')} stroke="#ffa31a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="newProperties" name={t('growthNewProperties')} stroke="#4d9fff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="requests" name={t('growthRequests')} stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[12px] border border-border bg-card p-4" data-testid="recent-users">
          <h2 className="mb-3 text-sm font-semibold">{t('recentUsers')}</h2>
          {recentUsers?.data.length ? (
            <ul className="space-y-2 text-sm">
              {recentUsers.data.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{user.name}</span>
                  <span className="shrink-0 text-xs text-fg-muted">{user.phone}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('empty')}</p>
          )}
        </div>
        <div className="rounded-[12px] border border-border bg-card p-4" data-testid="recent-properties">
          <h2 className="mb-3 text-sm font-semibold">{t('recentProperties')}</h2>
          {recentProperties?.data.length ? (
            <ul className="space-y-2 text-sm">
              {recentProperties.data.map((property) => (
                <li key={property.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{property.title}</span>
                  <span className="shrink-0 text-xs text-fg-muted">{property.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('empty')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

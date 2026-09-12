'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { OwnerAnalyticsResponseT } from '@rentuz/contracts';
import { Badge, EmptyState } from '@rentuz/ui';
import { api } from '@/lib/api';
import { formatDateTimeTak } from '@/lib/format';
import { KpiCard } from './KpiCard';
import { Sparkline } from './Sparkline';

/**
 * §31 owner dashboard — replaces the Phase 2 mock. KPIs + 14-day sparkline
 * from /owner/analytics (30 d); recent requests from the owner list endpoint;
 * active properties = top 3 by views (7 d) merged with /properties/me for
 * status; recent messages from /conversations (Phase 5 — hidden until merged).
 */
interface OwnerListing {
  id: string;
  slug: string;
  title: string;
  status: string;
  views: number;
  priceUzs: number;
  createdAt: string;
}

interface OwnerRequestRow {
  id: string;
  status: string;
  createdAt: string;
  propertyId: string;
  propertyCard: { id: string; title: string; slug: string };
  tenantCard: { name: string; avatarUrl: string | null } | null;
}

interface ConversationRow {
  id: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount?: number;
}

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000 + 5 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

export function DashboardClient({ sessionName }: { sessionName: string }) {
  const t = useTranslations('owner.dashboard');

  const analytics30 = useQuery({
    queryKey: ['analytics', 'overview', '30d'],
    queryFn: () => api.get<OwnerAnalyticsResponseT>('/owner/analytics?range=30d'),
  });
  const spark14 = useQuery({
    queryKey: ['analytics', 'overview', '14d'],
    queryFn: () =>
      api.get<OwnerAnalyticsResponseT>(`/owner/analytics?range=custom&from=${isoDay(13)}&to=${isoDay(0)}`),
  });
  const analytics7 = useQuery({
    queryKey: ['analytics', 'overview', '7d'],
    queryFn: () => api.get<OwnerAnalyticsResponseT>('/owner/analytics?range=7d'),
  });
  const listings = useQuery({
    queryKey: ['owner', 'listings'],
    queryFn: () => api.get<OwnerListing[]>('/properties/me'),
  });
  const requests = useQuery({
    queryKey: ['owner', 'requests', { page: 1, limit: 5 }],
    queryFn: () => api.get<{ data: OwnerRequestRow[] }>('/owner/rental-requests?limit=5'),
  });
  // Phase 5 endpoint — 404 until chat lands; hide the tile then.
  const conversations = useQuery({
    queryKey: ['owner', 'recent-conversations'],
    queryFn: async () => {
      try {
        return await api.get<{ data: ConversationRow[] }>('/conversations?limit=3');
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404 || status === 401) return null;
        throw e;
      }
    },
    retry: false,
  });

  const overview = analytics30.data?.overview;
  const kpis: Array<{ key: 'views' | 'favorites' | 'messages' | 'requests' | 'conversion'; value: string }> = [
    { key: 'views', value: String(overview?.views ?? '—') },
    { key: 'favorites', value: String(overview?.favorites ?? '—') },
    { key: 'messages', value: String(overview?.messages ?? '—') },
    { key: 'requests', value: String(overview?.requests ?? '—') },
    {
      key: 'conversion',
      value: overview ? `${Math.round(overview.conversion * 100)}%` : '—',
    },
  ];

  const statusById = new Map((listings.data ?? []).map((l) => [l.id, l.status]));
  const top3 = (analytics7.data?.topProperties ?? [])
    .slice(0, 3)
    .map((tp) => ({ ...tp, status: statusById.get(tp.propertyId) ?? 'UNKNOWN' }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-fg-secondary">Salom, {sessionName}.</p>
        </div>
        <Link
          href="/owner/properties/create"
          className="inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover"
        >
          {t('create')}
        </Link>
      </header>

      {/* KPI cards — real analytics (§34) */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="owner-kpis">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={t(`kpi.${k.key}`)} value={k.value} accent={k.key === 'conversion'} />
        ))}
      </section>

      {spark14.data && spark14.data.series.length > 0 && (
        <section className="rounded-[12px] border border-border bg-card p-4">
          <h2 className="mb-1 text-xs uppercase text-fg-muted">{t('kpi.views')} — {t('trends14')}</h2>
          <Sparkline series={spark14.data.series} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('recentRequests')}</h2>
            <Link href="/owner/requests" className="text-sm text-primary hover:underline">
              {t('viewAllRequests')}
            </Link>
          </div>
          {(requests.data?.data.length ?? 0) === 0 ? (
            <p className="rounded-[12px] border border-border bg-card px-4 py-6 text-center text-sm text-fg-muted">
              {t('noRequests')}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="recent-requests">
              {requests.data?.data.map((r) => (
                <li key={r.id} className="rounded-[12px] border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{r.propertyCard.title || '—'}</p>
                    <Badge
                      variant={r.status === 'PENDING' ? 'info' : r.status === 'ACCEPTED' ? 'success' : 'neutral'}
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {r.tenantCard?.name ? `${r.tenantCard.name} · ` : ''}
                    {formatDateTimeTak(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('activeProperties')}</h2>
          {top3.length === 0 ? (
            <p className="rounded-[12px] border border-border bg-card px-4 py-6 text-center text-sm text-fg-muted">
              {t('noProperties')}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="active-properties">
              {top3.map((p) => (
                <li key={p.propertyId} className="flex items-center justify-between rounded-[12px] border border-border bg-card px-4 py-3">
                  <Link
                    href={`/owner/properties/${p.propertyId}/edit`}
                    className="min-w-0 truncate text-sm font-medium hover:text-primary"
                  >
                    {p.title || '—'}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-fg-muted">{p.views} 👁</span>
                    <Badge variant={p.status === 'ACTIVE' ? 'success' : p.status === 'REJECTED' ? 'error' : 'neutral'}>
                      {p.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {conversations.data && conversations.data.data.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('recentMessages')}</h2>
          <ul className="space-y-2">
            {conversations.data.data.map((c) => (
              <li key={c.id} className="rounded-[12px] border border-border bg-card px-4 py-3">
                <p className="truncate text-sm">{c.lastMessagePreview ?? '—'}</p>
                {c.lastMessageAt && (
                  <p className="mt-1 text-xs text-fg-muted">{formatDateTimeTak(c.lastMessageAt)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(listings.data?.length ?? 0) === 0 && (
        <EmptyState
          title={t('noProperties')}
          action={
            <Link
              href="/owner/properties/create"
              className="inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover"
            >
              {t('create')}
            </Link>
          }
        />
      )}
    </div>
  );
}

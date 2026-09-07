import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EmptyState, Badge } from '@rentuz/ui';
import { getSession } from '@/lib/session';
import { api } from '@/lib/api';

type OwnerListing = {
  id: string;
  slug: string;
  title: string;
  status: string;
  views: number;
  priceUzs: number;
  currency: string;
  createdAt: string;
};

export default async function OwnerDashboardPage() {
  const session = await getSession();
  const t = await getTranslations('owner.dashboard');

  let listings: OwnerListing[] = [];
  try {
    // The backend's `GET /properties/me` returns the raw array (envelope stripped client-side).
    listings = (await api.get<OwnerListing[]>('/properties/me')) ?? [];
  } catch {
    listings = [];
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-fg-secondary">Salom, {session?.name}.</p>
        </div>
        <Link
          href="/owner/properties/create"
          className="inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover"
        >
          {t('create')}
        </Link>
      </header>

      {/* KPI cards — mocked this phase; real analytics land in Phase 6 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(['views', 'favorites', 'messages', 'requests', 'conversion'] as const).map((k) => (
          <div key={k} className="rounded-[12px] border border-border bg-card p-4">
            <p className="text-xs uppercase text-fg-muted">{t(`kpi.${k}`)}</p>
            <p className="mt-2 text-2xl font-bold">—</p>
            <p className="text-[10px] text-fg-muted">Phase 6</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('recentProperties')}</h2>
        {listings.length === 0 ? (
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
        ) : (
          <ul className="space-y-2">
            {listings.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-[12px] border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/owner/properties/${p.id}/edit`}
                    className="block truncate text-sm font-medium hover:text-primary"
                  >
                    {p.title || '(sarlavha kiritilmagan)'}
                  </Link>
                  <p className="text-xs text-fg-muted">
                    {new Intl.NumberFormat('uz-UZ').format(p.priceUzs / 100)} {p.currency}
                  </p>
                </div>
                <Badge variant={p.status === 'ACTIVE' ? 'success' : p.status === 'REJECTED' ? 'error' : 'neutral'}>
                  {p.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

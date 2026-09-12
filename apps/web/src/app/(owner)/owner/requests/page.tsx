import type { Metadata } from 'next';
import Link from 'next/link';
import type { RentalRequestDTOT } from '@rentuz/contracts';
import { requireSession } from '@/lib/session';
import { serverApiGet } from '@/lib/server-api';
import { EmptyState } from '@rentuz/ui';
import { StatusBadge } from '@/components/rentals/StatusBadge';
import { RequestActions } from '@/components/rentals/RequestActions';
import { formatPriceUzs } from '@/components/search/filter-utils';

/**
 * §1.3 item 16 — owner's requests for their properties with status tabs,
 * accept/reject actions (PENDING only), and the tenant card per row.
 */

const TABS: Array<{ key: string; label: string }> = [
  { key: '', label: 'Barchasi' },
  { key: 'PENDING', label: 'Kutayotgan' },
  { key: 'ACCEPTED', label: 'Qabul qilingan' },
  { key: 'REJECTED', label: 'Rad etilgan' },
  { key: 'COMPLETED', label: 'Yakunlangan' },
];

const DATE_FMT = new Intl.DateTimeFormat('uz-UZ', {
  timeZone: 'Asia/Tashkent',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const metadata: Metadata = { title: 'Ijara so\'rovlari' };

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function OwnerRequestsPage({ searchParams }: PageProps) {
  await requireSession();
  const params = await searchParams;
  const status = TABS.some((t) => t.key === params.status) ? params.status : undefined;

  let rows: RentalRequestDTOT[] = [];
  let meta = { page: 1, limit: 20, total: 0, totalPages: 1 };
  try {
    const qs = new URLSearchParams({ page: params.page ?? '1' });
    if (status) qs.set('status', status);
    const payload = await serverApiGet<{ data: RentalRequestDTOT[]; meta: typeof meta }>(
      `/owner/rental-requests?${qs.toString()}`,
    );
    rows = payload.data;
    meta = payload.meta;
  } catch {
    rows = [];
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold">Ijara so&apos;rovlari</h1>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Holat bo'yicha">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key ? `/owner/requests?status=${tab.key}` : '/owner/requests'}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-sm ${
              (status ?? '') === tab.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-fg-secondary hover:text-fg'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="Hozircha so'rovlar yo'q"
          description="E'lonlaringiz faol bo'lsa, ijarchilar shu yerdan so'rov yuboradi"
          action={
            <a
              href="/owner/properties/create"
              className="inline-flex h-10 items-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover"
            >
              E'lon berish
            </a>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[14px] border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.tenantCard ? (
                      <span className="text-sm font-medium">{r.tenantCard.name}</span>
                    ) : null}
                    <StatusBadge status={r.status} />
                  </div>
                  <Link href={`/property/${r.propertyCard.slug}`} className="mt-1 line-clamp-1 block text-sm text-fg-secondary hover:text-primary">
                    {r.propertyCard.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {DATE_FMT.format(new Date(r.startDate))} — {DATE_FMT.format(new Date(r.endDate))} ·{' '}
                    {r.durationMonths} oy · {formatPriceUzs(r.priceSnapshot)} {r.currency}
                  </p>
                  <p className="mt-2 line-clamp-2 rounded-[10px] bg-elevated px-3 py-2 text-xs text-fg-secondary">
                    {r.message}
                  </p>
                  {r.decisionNote ? (
                    <p className="mt-1 text-xs text-fg-muted">Izoh: {r.decisionNote}</p>
                  ) : null}
                </div>
                <RequestActions requestId={r.id} status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {meta.totalPages > 1 ? (
        <nav className="mt-6 flex justify-center gap-2 text-sm" aria-label="Sahifalar">
          {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/owner/requests?${status ? `status=${status}&` : ''}page=${p}`}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] border ${
                p === meta.page ? 'border-primary text-primary' : 'border-border text-fg-secondary hover:text-fg'
              }`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

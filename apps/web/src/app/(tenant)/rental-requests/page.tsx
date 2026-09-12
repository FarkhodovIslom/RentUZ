import type { Metadata } from 'next';
import Link from 'next/link';
import type { RentalRequestDTOT } from '@rentuz/contracts';
import { requireSession } from '@/lib/session';
import { serverApiGet } from '@/lib/server-api';
import { EmptyState } from '@rentuz/ui';
import { StatusBadge } from '@/components/rentals/StatusBadge';
import { CancelRequestButton } from '@/components/rentals/CancelRequestButton';
import { formatPriceUzs } from '@/components/search/filter-utils';

/**
 * §1.3 item 14 — tenant's requests with status tabs (?status=, §63 URL state).
 * RSC via serverApiGet; PENDING rows carry a cancel action.
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

export default async function RentalRequestsPage({ searchParams }: PageProps) {
  await requireSession();
  const params = await searchParams;
  const status = TABS.some((t) => t.key === params.status) ? params.status : undefined;

  let rows: RentalRequestDTOT[] = [];
  let meta = { page: 1, limit: 20, total: 0, totalPages: 1 };
  try {
    const qs = new URLSearchParams({ page: params.page ?? '1' });
    if (status) qs.set('status', status);
    const payload = await serverApiGet<{ data: RentalRequestDTOT[]; meta: typeof meta }>(
      `/rental-requests/my?${qs.toString()}`,
    );
    rows = payload.data;
    meta = payload.meta;
  } catch {
    rows = [];
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Ijara so&apos;rovlari</h1>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Holat bo'yicha">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key ? `/rental-requests?status=${tab.key}` : '/rental-requests'}
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
          description="E'lon sahifasidan 'Ijara so'rovi' tugmasi orqali ownerga so'rov yuborishingiz mumkin"
          action={
            <a
              href="/rentals"
              className="inline-flex h-10 items-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover"
            >
              E'lonlarni ko'rish
            </a>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[14px] border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/property/${r.propertyCard.slug}`} className="line-clamp-1 font-medium hover:text-primary">
                    {r.propertyCard.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {r.propertyCard.regionName ? `${r.propertyCard.regionName}, ` : ''}
                    {r.propertyCard.address}
                  </p>
                  <p className="mt-1 text-xs text-fg-secondary">
                    {DATE_FMT.format(new Date(r.startDate))} — {DATE_FMT.format(new Date(r.endDate))} ·{' '}
                    {r.durationMonths} oy
                  </p>
                  {r.decisionNote ? (
                    <p className="mt-1 text-xs text-fg-muted">Izoh: {r.decisionNote}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={r.status} />
                  <p className="text-sm font-bold text-primary">
                    {formatPriceUzs(r.priceSnapshot)} {r.currency}
                  </p>
                  {r.status === 'PENDING' ? <CancelRequestButton requestId={r.id} /> : null}
                </div>
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
              href={`/rental-requests?${status ? `status=${status}&` : ''}page=${p}`}
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

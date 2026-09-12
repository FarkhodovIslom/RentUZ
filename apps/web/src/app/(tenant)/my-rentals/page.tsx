import type { Metadata } from 'next';
import Link from 'next/link';
import type { RentalRequestDTOT } from '@rentuz/contracts';
import { requireSession } from '@/lib/session';
import { serverApiGet } from '@/lib/server-api';
import { EmptyState } from '@rentuz/ui';
import { StartChatButton } from '@/components/chat/StartChatButton';
import { StatusBadge } from '@/components/rentals/StatusBadge';
import { formatPriceUzs } from '@/components/search/filter-utils';

/**
 * §26 "My Rentals" — four views. ACTIVE is derived client-of-API side: the
 * tab fetches status=ACCEPTED and the card shows the rental window; rows past
 * their end (before the hourly job sweeps) still render under Yakunlanmoqda
 * semantics via the badge. Contact/chat button ships in Phase 5.
 */

const TABS: Array<{ key: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'CANCELLED'; label: string; query?: string }> = [
  { key: 'ACTIVE', label: 'Faol' },
  { key: 'PENDING', label: 'Kutayotgan', query: 'PENDING' },
  { key: 'COMPLETED', label: 'Yakunlangan', query: 'COMPLETED' },
  { key: 'CANCELLED', label: 'Bekor qilingan', query: 'CANCELLED' },
];

const DATE_FMT = new Intl.DateTimeFormat('uz-UZ', {
  timeZone: 'Asia/Tashkent',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const metadata: Metadata = { title: 'Ijaralarim' };

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function MyRentalsPage({ searchParams }: PageProps) {
  await requireSession();
  const params = await searchParams;
  const tab = TABS.some((t) => t.key === params.tab) ? (params.tab as 'ACTIVE') : 'ACTIVE';

  let rows: RentalRequestDTOT[] = [];
  try {
    // ACTIVE view = ACCEPTED rows (the hourly complete-rentals job flips
    // past-end ones to COMPLETED; the derived endDate shows the window).
    const status = tab === 'ACTIVE' ? 'ACCEPTED' : (TABS.find((t) => t.key === tab)?.query ?? tab);
    rows = (await serverApiGet<{ data: RentalRequestDTOT[] }>(`/rental-requests/my?status=${status}`)).data;
    if (tab === 'ACTIVE') {
      rows = rows.filter((r) => new Date(r.endDate).getTime() > Date.now());
    }
  } catch {
    rows = [];
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Ijaralarim</h1>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Ijara holati">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/my-rentals?tab=${t.key}`}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-sm ${
              tab === t.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-fg-secondary hover:text-fg'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="Bu bo'limda ijara yo'q"
          description="Owner so'rovingizni qabul qilgach, faol ijara shu yerda ko'rinadi"
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
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={tab === 'ACTIVE' ? 'ACTIVE' : r.status} />
                  <p className="text-sm font-bold text-primary">
                    {formatPriceUzs(r.priceSnapshot)} {r.currency}
                  </p>
                  <StartChatButton propertyId={r.propertyId} variant="compact" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

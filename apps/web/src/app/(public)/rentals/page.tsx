import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type { PropertyCardDTOT } from '@rentuz/contracts';
import { serverApiGet, ServerApiError } from '@/lib/server-api';
import { PropertyCard } from '@/components/property/PropertyCard';
import { EmptyState } from '@rentuz/ui';
import { FilterDrawer } from '@/components/search/FilterDrawer';
import { SortDropdown } from '@/components/search/SortDropdown';
import { Pagination } from '@/components/search/Pagination';
import { buildSearchQuery, firstParam, type SearchParamsRecord } from '@/components/search/filter-utils';

export const metadata: Metadata = {
  title: 'Ijara e’lonlari',
  description: "O'zbekiston bo'ylab ijara uylarni narx, hudud va sharoit bo'yicha filtrlang.",
};

interface PaginatedCards {
  data: PropertyCardDTOT[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const params = await searchParams;
  const t = await getTranslations('rentals');
  const query = buildSearchQuery(params, { limit: 24 });

  let cards: PropertyCardDTOT[] = [];
  let meta = { page: 1, limit: 24, total: 0, totalPages: 1 };
  try {
    const payload = await serverApiGet<PaginatedCards>(`/search/properties${query}`);
    cards = payload.data;
    meta = payload.meta;
  } catch (error) {
    if (!(error instanceof ServerApiError) || error.status !== 400) {
      throw error;
    }
    // Bad filter values in the URL — fall back to the plain listing.
    const payload = await serverApiGet<PaginatedCards>('/search/properties?limit=24');
    cards = payload.data;
    meta = payload.meta;
  }

  const paginationParams: Record<string, string | undefined> = {};
  for (const key of ['city', 'district', 'type', 'minPrice', 'maxPrice', 'rooms', 'bedrooms', 'bathrooms', 'minArea', 'maxArea', 'minFloor', 'furnished', 'pets', 'smoking', 'verified', 'sort']) {
    const value = firstParam(params, key);
    if (value) paginationParams[key] = value;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-fg-muted">{meta.total} ta e&apos;lon</p>
        </div>
        <div className="flex items-center gap-2">
          <FilterDrawer />
          <SortDropdown />
        </div>
      </header>

      {cards.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <a href="/rentals" className="text-sm font-medium text-primary hover:text-primary-hover">
              {t('empty.cta')}
            </a>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <PropertyCard key={card.id} property={card} />
          ))}
        </div>
      )}

      <Pagination page={meta.page} totalPages={meta.totalPages} basePath="/rentals" params={paginationParams} />
    </div>
  );
}

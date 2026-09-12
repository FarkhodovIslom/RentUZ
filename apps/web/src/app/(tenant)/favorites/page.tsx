import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type { PropertyCardDTOT } from '@rentuz/contracts';
import { requireSession } from '@/lib/session';
import { serverApiGet } from '@/lib/server-api';
import { PropertyCard } from '@/components/property/PropertyCard';
import { EmptyState } from '@rentuz/ui';
import { FilterDrawer } from '@/components/search/FilterDrawer';
import { SortDropdown } from '@/components/search/SortDropdown';
import { Pagination } from '@/components/search/Pagination';
import { buildSearchQuery, firstParam, type SearchParamsRecord } from '@/components/search/filter-utils';

export const metadata: Metadata = { title: 'Saqlangan e’lonlar' };

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireSession();
  const params = await searchParams;
  const t = await getTranslations('favorites.empty');
  const query = buildSearchQuery(params, { limit: 24 });

  let cards: PropertyCardDTOT[] = [];
  let meta = { page: 1, limit: 24, total: 0, totalPages: 1 };
  try {
    const payload = await serverApiGet<{ data: PropertyCardDTOT[]; meta: typeof meta }>(
      `/favorites${query}`,
    );
    cards = payload.data;
    meta = payload.meta;
  } catch {
    cards = [];
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
          <h1 className="text-2xl font-bold">Saqlangan e&apos;lonlar</h1>
          <p className="text-sm text-fg-muted">{meta.total} ta e&apos;lon</p>
        </div>
        <div className="flex items-center gap-2">
          <FilterDrawer />
          <SortDropdown />
        </div>
      </header>

      {cards.length === 0 ? (
        <EmptyState
          title={t('title')}
          description={t('description')}
          action={
            <a
              href="/rentals"
              className="inline-flex h-10 items-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover"
            >
              {t('cta')}
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

      <Pagination page={meta.page} totalPages={meta.totalPages} basePath="/favorites" params={paginationParams} />
    </div>
  );
}

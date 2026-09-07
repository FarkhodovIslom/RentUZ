import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/api';
import { PropertyCard } from '@/components/property/PropertyCard';

type Card = {
  id: string;
  slug: string;
  title: string;
  price: number;
  priceUzs: number;
  currency: string;
  type: string;
  rooms: number;
  area: number;
  address: string;
  mainImageUrl: string | null;
  regionName: string | null;
  isVerified: boolean;
  createdAt: string;
};

export default async function RentalsPage() {
  const t = await getTranslations('home');

  let cards: Card[] = [];
  let total = 0;
  try {
    const data = await api.get<{ data: Card[]; meta: { total: number } }>('/public/properties?limit=24');
    cards = data.data;
    total = data.meta.total;
  } catch {
    cards = [];
    total = 0;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('hero.title')}</h1>
        <p className="text-sm text-fg-muted">{total} ta e'lon</p>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-border bg-card p-10 text-center text-fg-muted">
          Hozircha e'lon yo'q
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <PropertyCard key={c.id} property={c} />
          ))}
        </div>
      )}
    </div>
  );
}

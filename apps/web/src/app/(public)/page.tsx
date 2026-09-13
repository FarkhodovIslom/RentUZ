import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { CityDTOT, PropertyCardDTOT } from '@rentuz/contracts';
import { Badge, Skeleton } from '@rentuz/ui';
import { serverApiGet } from '@/lib/server-api';
import { PropertyCard } from '@/components/property/PropertyCard';
import { MapDiscovery } from '@/components/map/MapDiscovery';

export const metadata: Metadata = {
  title: "O'zbekistonda ijara uy izlash — RentUZ",
  description:
    "O'zbekistondagi ijara uylarini narx, hudud va sharoit bo'yicha bir joydan izlang. Tasdiqlangan e'lonlar, xarita va tezkor aloqa.",
  alternates: { canonical: '/' },
  openGraph: {
    title: "O'zbekistonda ijara uy izlash — RentUZ",
    description:
      "O'zbekistondagi ijara uylarini narx, hudud va sharoit bo'yicha bir joydan izlang.",
    url: '/',
    siteName: 'RentUZ',
    type: 'website',
  },
};

const TRUST_KEYS = ['verified', 'easy', 'map', 'contact'] as const;
const QUICK_ROOM_CHIPS = [
  { label: '1 xonali', href: '/rentals?rooms=1' },
  { label: '2 xonali', href: '/rentals?rooms=2' },
  { label: '3 xonali', href: '/rentals?rooms=3' },
  { label: '3 mln gacha', href: '/rentals?maxPrice=3000000' },
  { label: 'Tasdiqlangan', href: '/rentals?verified=true' },
];

const sectionTitle = 'text-2xl font-bold tracking-tight md:text-3xl';

export default async function HomePage() {
  const t = await getTranslations('home');
  const tSections = await getTranslations('homeSections');
  const tFaq = await getTranslations('homeSections.faq.items');

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* §17: 2 Hero + 3 Search + 4 Quick chips */}
      <section className="py-14 text-center md:py-20">
        <Badge variant="primary" className="mb-6">
          {t('badge')}
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">{t('hero.title')}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-fg-secondary md:text-lg">{t('hero.subtitle')}</p>
        <Suspense fallback={<Skeleton className="mx-auto mt-8 h-14 max-w-xl rounded-[12px]" />}>
          <HeroSearch />
        </Suspense>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {QUICK_ROOM_CHIPS.map((chip) => (
            <a
              key={chip.href}
              href={chip.href}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm text-fg-secondary hover:border-primary hover:text-fg"
            >
              {chip.label}
            </a>
          ))}
        </div>
      </section>

      {/* 5 Trust indicators */}
      <section className="grid grid-cols-1 gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_KEYS.map((key) => (
          <div key={key} className="rounded-[12px] border border-border bg-card p-6 text-left">
            <h3 className="font-semibold">{t(`trust.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-fg-secondary">{t(`trust.${key}.description`)}</p>
          </div>
        ))}
      </section>

      {/* 6 Popular cities */}
      <section className="pb-20">
        <h2 className={sectionTitle}>{tSections('popularCities')}</h2>
        <Suspense
          fallback={
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-20 rounded-[12px]" />
              ))}
            </div>
          }
        >
          <PopularCities />
        </Suspense>
      </section>

      {/* 7 Featured listings */}
      <section className="pb-20">
        <div className="flex items-center justify-between">
          <h2 className={sectionTitle}>{tSections('featured')}</h2>
        </div>
        <Suspense fallback={<CardRowSkeleton />}>
          <FeaturedListings />
        </Suspense>
      </section>

      {/* 8 New listings */}
      <section className="pb-20">
        <div className="flex items-center justify-between">
          <h2 className={sectionTitle}>{tSections('newListings')}</h2>
          <a href="/rentals" className="text-sm font-medium text-primary hover:text-primary-hover">
            {tSections('viewAll')} →
          </a>
        </div>
        <Suspense fallback={<CardRowSkeleton />}>
          <NewListings />
        </Suspense>
      </section>

      {/* 9 Map discovery */}
      <section className="pb-20">
        <h2 className={sectionTitle}>{tSections('mapDiscovery.title')}</h2>
        <p className="mt-2 text-sm text-fg-secondary">{tSections('mapDiscovery.description')}</p>
        <div className="mt-6">
          <MapDiscovery />
        </div>
      </section>

      {/* 10 How it works */}
      <section className="pb-20">
        <h2 className={sectionTitle}>{tSections('howItWorks.title')}</h2>
        <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(['step1', 'step2', 'step3'] as const).map((step, i) => (
            <li key={step} className="rounded-[12px] border border-border bg-card p-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary font-bold text-black">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{tSections(`howItWorks.${step}.title`)}</h3>
              <p className="mt-2 text-sm text-fg-secondary">{tSections(`howItWorks.${step}.description`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 11 Verification / trust */}
      <section className="pb-20 rounded-[16px] border border-primary/30 bg-primary/5 p-8 text-center">
        <h2 className={sectionTitle}>{tSections('trustSection.title')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-fg-secondary">{tSections('trustSection.description')}</p>
      </section>

      {/* 12 Owner CTA */}
      <section className="pb-20 grid gap-6 rounded-[16px] border border-border bg-card p-8 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="text-xl font-bold">{tSections('ownerCta.title')}</h2>
          <p className="mt-2 text-sm text-fg-secondary">{tSections('ownerCta.description')}</p>
        </div>
        <a
          href="/owner/properties/create"
          className="inline-flex h-11 items-center justify-center rounded-[12px] bg-primary px-6 text-sm font-semibold text-black hover:bg-primary-hover"
        >
          {tSections('ownerCta.cta')}
        </a>
      </section>

      {/* 13 Premium CTA — informational, no checkout */}
      <section className="pb-20 grid gap-6 rounded-[16px] border border-dashed border-border p-8 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="text-xl font-bold">{tSections('premiumCta.title')}</h2>
          <p className="mt-2 text-sm text-fg-secondary">{tSections('premiumCta.description')}</p>
        </div>
        <span className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-[12px] border border-border px-6 text-sm font-medium text-fg-muted">
          {tSections('premiumCta.cta')}
        </span>
      </section>

      {/* 14 FAQ */}
      <section className="pb-20">
        <h2 className={sectionTitle}>{tSections('faq.title')}</h2>
        <div className="mt-6 space-y-2">
          {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const).map((key) => (
            <details key={key} className="group rounded-[12px] border border-border bg-card px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                <span className="flex items-center justify-between gap-2">
                  {tFaq(`${key}.q`)}
                  <span className="text-fg-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-fg-secondary">{tFaq(`${key}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 15 Final CTA */}
      <section className="pb-24 text-center">
        <h2 className={sectionTitle}>{tSections('finalCta.title')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-fg-secondary">{tSections('finalCta.description')}</p>
        <a
          href="/register"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-[12px] bg-primary px-8 text-base font-semibold text-black hover:bg-primary-hover"
        >
          {tSections('finalCta.cta')}
        </a>
      </section>
    </div>
  );
}

/** §17 section 3 — region select + quick chips link into /rentals (§63). */
async function HeroSearch() {
  const t = await getTranslations('home');
  let cities: CityDTOT[] = [];
  try {
    cities = await serverApiGet<CityDTOT[]>('/search/cities');
  } catch {
    cities = [];
  }
  return (
    <form
      action="/rentals"
      className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
    >
      <label className="flex-1 text-left">
        <span className="mb-1 block text-xs text-fg-secondary">{t('search.label')}</span>
        <select
          name="city"
          aria-label={t('search.label')}
          className="h-11 w-full rounded-[12px] border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        >
          <option value="">{t('search.placeholder')}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-[12px] bg-primary px-6 text-sm font-semibold text-black hover:bg-primary-hover"
      >
        {t('search.cta')}
      </button>
    </form>
  );
}

async function PopularCities() {
  const tSections = await getTranslations('homeSections');
  let cities: CityDTOT[] = [];
  try {
    cities = await serverApiGet<CityDTOT[]>('/search/cities');
  } catch {
    cities = [];
  }
  if (cities.length === 0) {
    return <p className="mt-6 text-sm text-fg-muted">Hozircha ma&apos;lumot yo&apos;q</p>;
  }
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cities.slice(0, 10).map((city) => (
        <a
          key={city.id}
          href={`/rentals?city=${city.id}`}
          className="rounded-[12px] border border-border bg-card p-4 text-left transition-colors hover:border-primary"
        >
          <p className="font-semibold">{city.name}</p>
          <p className="mt-1 text-xs text-fg-muted">{tSections('listings', { count: city.count })}</p>
        </a>
      ))}
    </div>
  );
}

async function FeaturedListings() {
  let cards: PropertyCardDTOT[] = [];
  try {
    cards = await serverApiGet<PropertyCardDTOT[]>('/search/featured');
  } catch {
    cards = [];
  }
  if (cards.length === 0) return <p className="mt-6 text-sm text-fg-muted">Hozircha e&apos;lon yo&apos;q</p>;
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.slice(0, 4).map((card) => (
        <PropertyCard key={card.id} property={card} />
      ))}
    </div>
  );
}

async function NewListings() {
  let cards: PropertyCardDTOT[] = [];
  try {
    const payload = await serverApiGet<{ data: PropertyCardDTOT[] }>('/search/properties?sort=newest&limit=8');
    cards = payload.data;
  } catch {
    cards = [];
  }
  if (cards.length === 0) return <p className="mt-6 text-sm text-fg-muted">Hozircha e&apos;lon yo&apos;q</p>;
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <PropertyCard key={card.id} property={card} />
      ))}
    </div>
  );
}

function CardRowSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-72 rounded-[12px]" />
      ))}
    </div>
  );
}

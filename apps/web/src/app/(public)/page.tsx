import { getTranslations } from 'next-intl/server';
import { Badge, Button, Input } from '@rentuz/ui';

const QUICK_CHIPS = ['Toshkent', 'Samarqand', 'Buxoro', '1 xonali', '2 xonali', '3 xonali', '3 mln gacha'];
const TRUST_KEYS = ['verified', 'easy', 'map', 'contact'] as const;

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero + search (§17 sections 2–4) */}
      <section className="py-16 text-center md:py-24">
        <Badge variant="primary" className="mb-6">
          {t('badge')}
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-fg-secondary md:text-lg">
          {t('hero.subtitle')}
        </p>
        <form
          action="/rentals"
          className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Input
            id="home-search"
            name="city"
            label={t('search.label')}
            placeholder={t('search.placeholder')}
            wrapperClassName="flex-1"
          />
          <Button type="submit" size="lg">
            {t('search.cta')}
          </Button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {QUICK_CHIPS.map((chip) => (
            <a
              key={chip}
              href={`/rentals?city=${encodeURIComponent(chip)}`}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm text-fg-secondary hover:border-border-hover hover:text-fg"
            >
              {chip}
            </a>
          ))}
        </div>
      </section>

      {/* Trust indicators (§17 section 5) */}
      <section className="grid grid-cols-1 gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_KEYS.map((key) => (
          <div key={key} className="rounded-[12px] border border-border bg-card p-6 text-left">
            <h3 className="font-semibold">{t(`trust.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-fg-secondary">{t(`trust.${key}.description`)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@rentuz/ui';
import { requireSession } from '@/lib/session';

export const metadata = { title: "Saqlangan e'lonlar" };

export default async function FavoritesPage() {
  await requireSession();
  const t = await getTranslations('favorites.empty');

  const browseClass =
    'inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover';

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        title={t('title')}
        description={t('description')}
        action={
          <a href="/rentals" className={browseClass}>
            {t('cta')}
          </a>
        }
      />
    </div>
  );
}

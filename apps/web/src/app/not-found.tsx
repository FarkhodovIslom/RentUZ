import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@rentuz/ui';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  const tCommon = await getTranslations('common');

  const backHomeClass =
    'inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover';

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        title={t('title')}
        description={t('description')}
        action={
          <a href="/" className={backHomeClass}>
            {tCommon('backHome')}
          </a>
        }
      />
    </main>
  );
}

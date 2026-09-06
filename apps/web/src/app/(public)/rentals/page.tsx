import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@rentuz/ui';

export const metadata = { title: 'Ijaralar' };

export default async function RentalsPage() {
  const t = await getTranslations('common');

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState title={t('comingSoonTitle')} description={t('comingSoonDescription')} />
    </div>
  );
}

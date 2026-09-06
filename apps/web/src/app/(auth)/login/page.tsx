import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@rentuz/ui';

export const metadata = { title: 'Kirish' };

export default async function LoginPage() {
  const t = await getTranslations('common');
  const tNav = await getTranslations('nav');

  return (
    <div className="w-full max-w-md">
      <EmptyState
        title={tNav('login')}
        description={t('comingSoonDescription')}
      />
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/** 403 landing page — requireRole('ADMIN') redirects non-admins here. */
export default async function ForbiddenPage() {
  const t = await getTranslations('errors');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold text-primary">403</p>
      <h1 className="text-xl font-semibold">Ruxsat yo‘q</h1>
      <p className="text-sm text-fg-secondary">
        {t('forbiddenDescription', { defaultValue: 'Bu sahifaga kirish huquqingiz yo‘q.' })}
      </p>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover"
      >
        Bosh sahifaga qaytish
      </Link>
    </main>
  );
}

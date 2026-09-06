import { getTranslations } from 'next-intl/server';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('nav');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <a href="/" className="text-lg font-bold tracking-tight">
            Rent<span className="text-primary">UZ</span>
          </a>
          <span className="ml-auto text-sm text-fg-secondary">{t('login')}</span>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">{children}</main>
    </div>
  );
}

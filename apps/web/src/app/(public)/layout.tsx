import { getTranslations } from 'next-intl/server';
import { Navbar } from '../../components/nav/Navbar';
import { BottomNav } from '../../components/nav/BottomNav';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('home');

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <footer className="border-t border-border py-8 text-center text-sm text-fg-muted">
        {t('footer')}
      </footer>
      <BottomNav />
    </div>
  );
}

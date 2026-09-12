import { getTranslations } from 'next-intl/server';
import { FavoritesBadge } from '@/components/favorites/FavoritesBadge';
import { ChatBadge } from '@/components/chat/ChatBadge';
import { RequestsBadge } from '@/components/rentals/RequestsBadge';

export async function Navbar() {
  const t = await getTranslations('nav');

  const loginClass =
    'inline-flex h-9 items-center rounded-[12px] bg-primary px-3 text-sm font-medium text-black hover:bg-primary-hover';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="/" className="text-lg font-bold tracking-tight">
          Rent<span className="text-primary">UZ</span>
        </a>
        <nav aria-label="Asosiy" className="hidden items-center gap-6 text-sm text-fg-secondary md:flex">
          <a href="/rentals" className="hover:text-fg">
            {t('rentals')}
          </a>
          <a href="/map" className="hover:text-fg">
            {t('map')}
          </a>
          <a href="/favorites" className="inline-flex items-center hover:text-fg">
            {t('saved')}
            <FavoritesBadge />
          </a>
          <a href="/rental-requests" className="inline-flex items-center hover:text-fg">
            {t('requests')}
            <RequestsBadge />
          </a>
          <a href="/chat" className="inline-flex items-center hover:text-fg">
            {t('chat')}
            <ChatBadge />
          </a>
        </nav>
        <a href="/login" className={loginClass}>
          {t('login')}
        </a>
      </div>
    </header>
  );
}

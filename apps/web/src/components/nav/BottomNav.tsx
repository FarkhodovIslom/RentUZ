import { getTranslations } from 'next-intl/server';
import { ChatBadge } from '@/components/chat/ChatBadge';

const ITEMS = [
  { href: '/', key: 'home' },
  { href: '/rentals', key: 'rentals' },
  { href: '/map', key: 'map' },
  { href: '/favorites', key: 'saved' },
  { href: '/chat', key: 'chat', badge: true },
  { href: '/rental-requests', key: 'requests' },
  { href: '/profile', key: 'profile' },
] as const;

/** Mobile bottom navigation — spec §6 (7 slots since Phase 5 chat, 44px+ touch targets). */
export async function BottomNav() {
  const t = await getTranslations('nav');

  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-7 border-t border-border bg-card md:hidden"
    >
      {ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="flex h-14 min-h-11 items-center justify-center text-[11px] text-fg-secondary active:text-primary"
        >
          {'badge' in item && item.badge ? (
            <span className="inline-flex items-center">
              {t(item.key)}
              <ChatBadge />
            </span>
          ) : (
            t(item.key)
          )}
        </a>
      ))}
    </nav>
  );
}

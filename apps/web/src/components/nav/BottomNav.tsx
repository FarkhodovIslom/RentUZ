import { getTranslations } from 'next-intl/server';

const ITEMS = [
  { href: '/', key: 'home' },
  { href: '/rentals', key: 'rentals' },
  { href: '/map', key: 'map' },
  { href: '/favorites', key: 'saved' },
  { href: '/profile', key: 'profile' },
] as const;

/** Mobile bottom navigation — spec §6 (5 items, 44px+ touch targets). */
export async function BottomNav() {
  const t = await getTranslations('nav');

  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-card md:hidden"
    >
      {ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="flex h-14 min-h-11 items-center justify-center text-xs text-fg-secondary active:text-primary"
        >
          {t(item.key)}
        </a>
      ))}
    </nav>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChatBadge } from '@/components/chat/ChatBadge';
import { api } from '@/lib/api';

const ITEMS = [
  { href: '/', key: 'home' },
  { href: '/rentals', key: 'rentals' },
  { href: '/map', key: 'map' },
  { href: '/favorites', key: 'saved' },
  { href: '/chat', key: 'chat', badge: true },
  { href: '/rental-requests', key: 'requests' },
  { href: '/profile', key: 'profile' },
] as const;

/**
 * Mobile bottom navigation — spec §6 (7 slots since Phase 5 chat, 44px+ touch
 * targets; admins get an 8th slot, §49). Fully client-side since Phase 8: the
 * old server `getSession()` read made every public page dynamic and broke
 * ISR (DYNAMIC_SERVER_USAGE). Translations come from NextIntlClientProvider.
 * The API's AdminGuard remains the real authorization gate.
 */
export function BottomNav() {
  const t = useTranslations('nav');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ role: string }>('/users/me')
      .then((me) => {
        if (!cancelled) setIsAdmin(me.role === 'ADMIN');
      })
      .catch(() => {
        // Anonymous / error — 7 slots.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = isAdmin ? [...ITEMS, { href: '/admin', key: 'admin' } as const] : ITEMS;

  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className={`fixed inset-x-0 bottom-0 z-50 grid border-t border-border bg-card md:hidden ${
        items.length >= 8 ? 'grid-cols-8' : 'grid-cols-7'
      }`}
    >
      {items.map((item) => (
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

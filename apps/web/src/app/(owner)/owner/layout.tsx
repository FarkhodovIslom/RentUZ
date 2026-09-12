import 'server-only';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { Sidebar } from '@/components/owner/Sidebar';

/**
 * Owner shell (§31): sidebar with dashboard, listings, requests (Phase 4),
 * messages (Phase 5), analytics (Phase 6), profile. Suspended users are
 * blocked at the data layer; owner gating here is "any verified session" —
 * suspended users get an explicit 403 inside the request itself (§54).
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const t = await getTranslations('owner.nav');

  const items = [
    { href: '/owner', label: t('dashboard'), exact: true },
    { href: '/owner/properties', label: t('properties') },
    { href: '/owner/properties/create', label: t('newProperty') },
    { href: '/owner/requests', label: t('requests') },
    { href: '/owner/messages', label: t('messages'), soon: true },
    { href: '/owner/analytics', label: t('analytics'), soon: true },
    { href: '/profile', label: t('profile') },
  ];

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={items} userName={session.name} />
      <main className="flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}

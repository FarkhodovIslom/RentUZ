import 'server-only';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { Sidebar } from '@/components/owner/Sidebar';
import { SkipLink } from '@/components/nav/SkipLink';
import { NotificationBell } from '@/components/notifications/NotificationBell';

/**
 * Admin shell (§49). requireRole('ADMIN') redirects anonymous visitors to
 * /login and non-admins/suspended admins to /forbidden. Server-side session
 * only — the API re-enforces every call via AdminGuard.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN' || session.status !== 'ACTIVE') redirect('/forbidden');

  const t = await getTranslations('admin.sidebar');
  const items = [
    { href: '/admin', label: t('overview'), exact: true },
    { href: '/admin/users', label: t('users') },
    { href: '/admin/properties', label: t('properties') },
    { href: '/admin/verification', label: t('verification') },
    { href: '/admin/reports', label: t('reports') },
    { href: '/admin/requests', label: t('requests') },
    { href: '/admin/analytics', label: t('analytics') },
    { href: '/admin/settings', label: t('settings') },
  ];

  return (
    <div className="flex min-h-dvh">
      <SkipLink />
      <Sidebar items={items} userName={session.name} />
      <main id="main-content" className="flex-1 p-6 md:p-8">
        <div className="mb-2 flex justify-end">
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}

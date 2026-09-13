import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { Navbar } from '../../components/nav/Navbar';
import { SkipLink } from '../../components/nav/SkipLink';
import { BottomNav } from '../../components/nav/BottomNav';

/**
 * Tenant shell — requires a session (0_Phase.md §2 BFF session rules).
 * Verification banner persists until the phone is verified (§54 gate).
 */
export default async function TenantLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const t = await getTranslations('verification.banner');

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <Navbar />
      {!session.isPhoneVerified ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-primary">{t('title')}</p>
            <p className="text-xs text-fg-secondary">{t('description')}</p>
          </div>
          <a
            href="/verify-phone"
            className="inline-flex h-9 items-center rounded-[12px] bg-primary px-3 text-sm font-medium text-black hover:bg-primary-hover"
          >
            {t('cta')}
          </a>
        </div>
      ) : null}
      <main id="main-content" className="flex-1 pb-24 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}

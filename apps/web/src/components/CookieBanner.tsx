'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * §99 / 8_Phase.md §1.8 item 46: minimal cookie notice. Stores the choice in
 * localStorage (rentuz:cookie-consent); a dismissed banner stays dismissed.
 * NOT a functional gate — the app works identically either way for the MVP
 * (auth cookies are strictly necessary; no analytics/marketing cookies ship).
 */
const STORAGE_KEY = 'rentuz:cookie-consent';

export function CookieBanner() {
  const t = useTranslations('cookies');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // SSR renders nothing; only browsers decide (also avoids hydration
    // mismatch — the flag is read post-mount).
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) === null);
    } catch {
      // Private mode / blocked storage — never nag on errors.
      setVisible(false);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t('bannerLabel')}
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-card/95 p-3 backdrop-blur md:bottom-0"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <p className="flex-1 text-xs text-fg-secondary md:text-sm">
          {t('text')}{' '}
          <a href="/privacy" className="text-primary underline hover:text-primary-hover">
            {t('privacy')}
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-9 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover"
        >
          {t('dismiss')}
        </button>
      </div>
    </div>
  );
}

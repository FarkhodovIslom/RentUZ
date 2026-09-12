'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { NotificationDTOT, NotificationListResponseT } from '@rentuz/contracts';
import { ApiError, api } from '@/lib/api';
import { NotificationItem } from './NotificationItem';
import { cn } from '@rentuz/ui/cn';

/** Navbar bell: 30 s + window-focus poll of unread-count, popover of the 5 latest (§29). */
export const UNREAD_COUNT_KEY = ['notifications', 'unread-count'] as const;
export const LATEST_LIST_KEY = ['notifications', 'latest'] as const;

export function NotificationBell({ align = 'right' }: { align?: 'right' | 'left' }) {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      try {
        return await api.get<{ count: number }>('/notifications/unread-count');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 10_000,
  });

  const { data: latest } = useQuery<NotificationListResponseT | null>({
    queryKey: LATEST_LIST_KEY,
    queryFn: async () => {
      try {
        return await api.get<NotificationListResponseT>('/notifications?limit=5');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    enabled: open,
    staleTime: 15_000,
  });

  // Close the popover on outside click.
  useDismissOnClickOutside(rootRef, () => setOpen(false));

  // Anonymous / unauthenticated → render nothing at all (RequestsBadge pattern).
  if (unreadData === null) return null;

  const count = unreadData?.count ?? 0;

  const markOne = async (n: NotificationDTOT) => {
    await api.patch(`/notifications/${n.id}/read`).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markAll = async () => {
    await api.post('/notifications/read-all').catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t('unreadBadge', { count })}
        data-testid="notification-bell"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex size-9 items-center justify-center rounded-[12px] text-fg-secondary hover:bg-surface hover:text-fg"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden>
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {count > 0 && (
          <span
            data-testid="notification-badge"
            className={cn(
              'absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-black',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-11 z-50 w-80 rounded-[14px] border border-border bg-elevated shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          data-testid="notification-popover"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">{t('title')}</span>
            {count > 0 && (
              <button type="button" onClick={() => void markAll()} className="text-xs text-primary hover:underline">
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-1">
            {latest && latest.data.length > 0 ? (
              latest.data.map((n) => (
                <NotificationItem key={n.id} notification={n} compact onRead={(item) => void markOne(item)} />
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-fg-muted">{t('empty')}</p>
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-center text-sm text-primary hover:underline"
          >
            {t('viewAll')}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Close the popover on outside click. */
export function useDismissOnClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

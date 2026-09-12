'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { groupNotificationsByDay, type NotificationDTOT, type NotificationListResponseT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { NotificationItem } from '@/components/notifications/NotificationItem';

/**
 * §29 full page: Bugun/Kecha/Oldin sections (grouped with the shared
 * contracts/tz.ts rule — the same one the API uses server-side), cursor
 * "load more", per-row mark-read, "Hammasini o'qish". Client component +
 * TanStack Query per the authenticated-surface split (0_Phase.md §9).
 */
const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const queryClient = useQueryClient();

  // Older cursor pages we've already appended; `nextCursor` = cursor the
  // CURRENT query fetched after (null → first page).
  const [older, setOlder] = useState<NotificationDTOT[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const { data, isPending, error, isFetching } = useQuery({
    queryKey: ['notifications', 'page', older.length, nextCursor],
    queryFn: () =>
      api.get<NotificationListResponseT>(
        `/notifications?limit=${PAGE_SIZE}${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: invalidateAll,
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      setOlder([]);
      setNextCursor(null);
      invalidateAll();
    },
  });

  const rows = useMemo(
    () => [...older.flat(), ...(data?.data ?? [])],
    [older, data],
  );
  const groups = useMemo(() => groupNotificationsByDay(rows, Date.now()), [rows]);

  const loadMore = () => {
    if (!data?.meta.hasMore || !data.meta.nextCursor) return;
    setOlder((o) => [...o, data.data]);
    setNextCursor(data.meta.nextCursor);
  };

  const sections = ['bugun', 'kecha', 'oldin'] as const;
  const hasAnything = rows.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        {hasAnything && (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            data-testid="mark-all-read"
            className="text-sm text-primary hover:underline disabled:opacity-50"
            disabled={markAll.isPending}
          >
            {t('markAllRead')}
          </button>
        )}
      </header>

      {isPending && <p className="py-10 text-center text-sm text-fg-muted">…</p>}

      {!hasAnything && !isPending && !error && (
        <p
          className="rounded-[14px] border border-border bg-card p-8 text-center text-sm text-fg-muted"
          data-testid="notifications-empty"
        >
          {t('empty')}
        </p>
      )}

      {sections.map(
        (key) =>
          groups[key].length > 0 && (
            <section key={key} className="mb-5" data-testid={`section-${key}`}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {t(`group.${key}`)}
              </h2>
              <div className="flex flex-col gap-1">
                {groups[key].map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={(item) => markRead.mutate(item.id)} />
                ))}
              </div>
            </section>
          ),
      )}

      {data?.meta.hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isFetching}
          className="mt-2 w-full rounded-[12px] border border-border py-2 text-sm text-fg-secondary hover:bg-surface"
        >
          {isFetching ? '…' : 'Ko\'prok ko\'rish'}
        </button>
      )}
    </div>
  );
}

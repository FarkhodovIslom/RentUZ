'use client';

import { useTranslations } from 'next-intl';
import type { NotificationDTOT } from '@rentuz/contracts';
import { formatPriceUzs, formatDateTimeTak } from '@/lib/format';
import { cn } from '@rentuz/ui/cn';

const TYPE_ICON: Record<string, string> = {
  REQUEST_NEW: '📨',
  REQUEST_ACCEPTED: '✅',
  REQUEST_REJECTED: '🚫',
  NEW_MESSAGE: '💬',
  PROPERTY_VERIFIED: '🏠',
  PROPERTY_REJECTED: '⛔',
  PRICE_CHANGED: '💰',
};

/**
 * Single row renderer shared by the bell popover and the /notifications page
 * (§29): icon + type title + interpolated body + Tashkent time + unread
 * accent. Body templates live under `notifications.bodies.<bodyKey>`.
 */
export function NotificationItem({
  notification,
  onRead,
  compact = false,
}: {
  notification: NotificationDTOT;
  onRead?: (n: NotificationDTOT) => void;
  compact?: boolean;
}) {
  const t = useTranslations('notifications');
  const d = notification.data as Record<string, unknown>;

  const vars = {
    property: typeof d.propertyTitle === 'string' ? d.propertyTitle : '—',
    name: typeof d.actorName === 'string' ? d.actorName : '',
    reason: typeof d.reason === 'string' ? d.reason : '—',
    oldPrice: typeof d.oldPriceUzs === 'number' ? formatPriceUzs(d.oldPriceUzs) : '—',
    newPrice: typeof d.newPriceUzs === 'number' ? formatPriceUzs(d.newPriceUzs) : '—',
  };

  const unread = notification.readAt === null;

  return (
    <button
      type="button"
      onClick={() => unread && onRead?.(notification)}
      className={cn(
        'flex w-full items-start gap-3 rounded-[12px] border-l-2 px-3 py-2 text-left transition',
        unread ? 'border-l-primary bg-surface' : 'border-l-transparent hover:bg-surface/60',
      )}
      data-testid={`notification-${notification.id}`}
      data-unread={unread}
    >
      <span aria-hidden className="mt-0.5 text-base leading-none">
        {TYPE_ICON[notification.type] ?? '🔔'}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', unread ? 'font-semibold text-fg' : 'text-fg-secondary')}>
          {t(`types.${camel(notification.type)}`)}
        </span>
        <span className={cn('block text-xs text-fg-muted', compact && 'line-clamp-1')}>
          {t(`bodies.${notification.bodyKey}`, vars)}
        </span>
        <span className="mt-0.5 block text-[11px] text-fg-muted">{formatDateTimeTak(notification.createdAt)}</span>
      </span>
      {unread && <span aria-label="unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

function camel(type: string): string {
  return type.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
}

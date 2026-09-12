import { describe, expect, it } from 'vitest';
import {
  NOTIF_TYPES,
  NotificationDTO,
  NotificationListQuery,
  NotificationListResponse,
  groupNotificationsByDay,
} from './notifications.js';

const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const TAK_MIDNIGHT = Date.UTC(2026, 8, 11, 19, 0, 0); // 00:00 Tashkent 2026-09-12
const TAK_TODAY_START = TAK_MIDNIGHT + 5 * MIN;

function notif(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid,
    type: 'REQUEST_ACCEPTED',
    titleKey: 'notifications.types.requestAccepted',
    bodyKey: 'request.accepted',
    data: { requestId: uuid, key: `request:${uuid}:accepted` },
    readAt: null,
    createdAt: new Date(TAK_TODAY_START).toISOString(),
    ...overrides,
  };
}

describe('NotifTypeSchema', () => {
  it('mirrors the seven Prisma enum values (i18n contract test depends on this list)', () => {
    expect(NOTIF_TYPES).toEqual([
      'REQUEST_NEW',
      'REQUEST_ACCEPTED',
      'REQUEST_REJECTED',
      'NEW_MESSAGE',
      'PROPERTY_VERIFIED',
      'PROPERTY_REJECTED',
      'PRICE_CHANGED',
    ]);
  });
});

describe('NotificationDTO', () => {
  it('parses a wire row and coerces createdAt to a Date', () => {
    const parsed = NotificationDTO.parse(notif());
    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.readAt).toBeNull();
  });

  it('rejects unknown notification types', () => {
    expect(NotificationDTO.safeParse(notif({ type: 'PAYMENT_RECEIVED' })).success).toBe(false);
  });
});

describe('NotificationListQuery', () => {
  it('defaults limit to 20 and caps it at 100', () => {
    expect(NotificationListQuery.parse({}).limit).toBe(20);
    expect(NotificationListQuery.parse({ limit: '100' }).limit).toBe(100);
    expect(NotificationListQuery.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('accepts an opaque cursor string', () => {
    expect(NotificationListQuery.parse({ cursor: '2026-09-12T10:00:00.000Z|abc' }).cursor).toBeTruthy();
  });
});

describe('NotificationListResponse', () => {
  it('validates the full grouped envelope', () => {
    const row = { ...notif(), createdAt: new Date(TAK_TODAY_START) };
    const ok = NotificationListResponse.safeParse({
      data: [row],
      groups: { bugun: [row], kecha: [], oldin: [] },
      meta: { limit: 20, nextCursor: null, hasMore: false },
    });
    expect(ok.success).toBe(true);
    expect(NotificationListResponse.safeParse({ data: [], groups: { bugun: [] }, meta: {} }).success).toBe(false);
  });
});

describe('groupNotificationsByDay', () => {
  it('splits a page into bugun/kecha/oldin at the Tashkent boundary', () => {
    const now = TAK_TODAY_START + 6 * 60 * MIN;
    const rows = [
      { createdAt: new Date(now - MIN) },
      { createdAt: new Date(TAK_MIDNIGHT - MIN) },
      { createdAt: new Date(TAK_MIDNIGHT - 2 * DAY) },
    ];
    const groups = groupNotificationsByDay(rows, now);
    expect(groups.bugun).toHaveLength(1);
    expect(groups.kecha).toHaveLength(1);
    expect(groups.oldin).toHaveLength(1);
  });
});

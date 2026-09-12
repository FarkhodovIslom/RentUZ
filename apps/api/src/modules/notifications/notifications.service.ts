import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  groupNotificationsByDay,
  type NotificationDTOT,
  type NotificationGroupsT,
  type NotificationListResponseT,
} from '@rentuz/contracts';
import { Prisma, type NotifType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';

/**
 * Phase 6 (6_Phase.md §1.1): full notifications module.
 * - enqueue is idempotent by (userId, type, data.key) via the partial unique
 *   index `notifications_idempotency_key_idx` — a buggy emitter replaying an
 *   event can't mint duplicate rows.
 * - unreadCount is cached in Redis for 30 s per user; every mutation
 *   (enqueue/markRead/markAllRead) invalidates it, so the navbar poll sees a
 *   new badge within its 30 s window (DoD).
 * - list uses keyset (cursor) pagination over (createdAt DESC, id DESC) —
 *   the deliberate Phase 6 deviation from the global offset convention (§92).
 */
export interface EnqueueNotification {
  userId: string;
  type: NotifType;
  titleKey: string;
  bodyKey: string;
  /** Must include a domain-unique `key` for idempotency (e.g. `request:42:accepted`). */
  data?: Record<string, string | number | boolean | null>;
}

export interface NotificationRow {
  id: string;
  type: NotifType;
  titleKey: string;
  bodyKey: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

const UNREAD_CACHE_PREFIX = 'notif:unread:';
const UNREAD_CACHE_TTL_SECONDS = 30;
/** Cursor format: `<createdAt ISO>|<id uuid>` — opaque to clients. */
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9a-f-]{36})$/i;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Fire-and-forget idempotent insert. ON CONFLICT targets the partial unique
   * index; rows without data.key never conflict (index excludes NULL).
   * Failures log but never break the emitting transaction's caller.
   */
  async enqueue(notification: EnqueueNotification): Promise<boolean> {
    const data = notification.data ?? {};
    try {
      const inserted = await this.prisma.$executeRaw`
        INSERT INTO "notifications" (id, "userId", type, "titleKey", "bodyKey", data, "createdAt")
        VALUES (gen_random_uuid(), ${notification.userId}::uuid, ${notification.type}::"NotifType",
                ${notification.titleKey}, ${notification.bodyKey},
                ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT ("userId", type, ((data ->> 'key'))) WHERE "data" ->> 'key' IS NOT NULL
        DO NOTHING`;
      if (inserted > 0) await this.invalidateUnreadCache(notification.userId);
      return inserted > 0;
    } catch (error) {
      this.logger.error(
        `enqueue failed (${notification.type}/${notification.bodyKey}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** COUNT of unread, Redis-cached 30 s (§46 navbar poll). */
  async unreadCount(userId: string): Promise<number> {
    const key = `${UNREAD_CACHE_PREFIX}${userId}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached !== null) {
      const parsed = Number(cached);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const count = await this.prisma.notifications.count({ where: { userId, readAt: null } });
    await this.redis.client.set(key, String(count), 'EX', UNREAD_CACHE_TTL_SECONDS).catch(() => undefined);
    return count;
  }

  /**
   * Cursor page + precomputed Tashkent-day groups (§46). Fetches limit+1 to
   * decide hasMore; the extra row never ships.
   */
  async list(userId: string, cursor?: string, limit = 20): Promise<NotificationListResponseT> {
    let before: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      const match = CURSOR_RE.exec(cursor);
      if (match) before = { createdAt: new Date(match[1]), id: match[2] };
      else this.logger.warn(`ignoring malformed notification cursor`);
    }

    const where = before
      ? Prisma.sql`"userId" = ${userId}::uuid AND ("createdAt", id) < (${before.createdAt}, ${before.id}::uuid)`
      : Prisma.sql`"userId" = ${userId}::uuid`;
    const rows = await this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
      SELECT id, type::text AS "type", "titleKey", "bodyKey", data, "readAt", "createdAt"
      FROM "notifications"
      WHERE ${where}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${limit + 1}`);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items: NotificationDTOT[] = page.map((row) => ({
      id: row.id,
      type: row.type,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      data: (row.data ?? {}) as Record<string, unknown>,
      readAt: row.readAt,
      createdAt: row.createdAt,
    }));

    const groups: NotificationGroupsT = groupNotificationsByDay(items, Date.now());
    const last = page[page.length - 1];
    return {
      data: items,
      groups,
      meta: {
        limit,
        hasMore,
        nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
      },
    };
  }

  /** Mark a specific notification read; 404 unknown, 403 other users' rows. */
  async markRead(userId: string, notificationId: string): Promise<{ id: string; readAt: Date }> {
    const row = await this.prisma.notifications.findUnique({
      where: { id: notificationId },
      select: { userId: true, readAt: true },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Bildirishnoma topilmadi' });
    if (row.userId !== userId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    const updated = await this.prisma.notifications.update({
      where: { id: notificationId },
      data: { readAt: row.readAt ?? new Date() },
      select: { id: true, readAt: true },
    });
    await this.invalidateUnreadCache(userId);
    return { id: updated.id, readAt: updated.readAt as Date };
  }

  /** Idempotent batch mark (POST body); rows not owned by the user are ignored. */
  async markReadMany(userId: string, ids: string[]): Promise<{ marked: number }> {
    const marked = await this.prisma.notifications.updateMany({
      where: { userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    if (marked.count > 0) await this.invalidateUnreadCache(userId);
    return { marked: marked.count };
  }

  async markAllRead(userId: string): Promise<{ marked: number }> {
    const marked = await this.prisma.notifications.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (marked.count > 0) await this.invalidateUnreadCache(userId);
    return { marked: marked.count };
  }

  private async invalidateUnreadCache(userId: string): Promise<void> {
    await this.redis.client.del(`${UNREAD_CACHE_PREFIX}${userId}`).catch(() => undefined);
  }
}

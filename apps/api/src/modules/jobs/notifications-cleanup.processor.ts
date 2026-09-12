import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Env } from '../../config/env.js';

/**
 * §1.2.7 — 03:00 Asia/Tashkent retention sweep. Read notifications live
 * NOTIFICATIONS_READ_RETENTION_DAYS (default 90); unread ones are dropped
 * after NOTIFICATIONS_UNREAD_RETENTION_DAYS (default 30) so inboxes don't
 * grow forever (§29).
 */
@Processor('notifications-cleanup', { concurrency: 1 })
export class NotificationsCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ deleted: number }> {
    const readDays = this.config.get('NOTIFICATIONS_READ_RETENTION_DAYS', { infer: true });
    const unreadDays = this.config.get('NOTIFICATIONS_UNREAD_RETENTION_DAYS', { infer: true });
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "notifications"
      WHERE ("readAt" IS NOT NULL AND "createdAt" < now() - make_interval(days => ${readDays}::int))
         OR ("readAt" IS NULL AND "createdAt" < now() - make_interval(days => ${unreadDays}::int))`;
    if (deleted > 0) this.logger.log(`notifications cleanup: removed ${deleted} expired row(s)`);
    return { deleted };
  }
}

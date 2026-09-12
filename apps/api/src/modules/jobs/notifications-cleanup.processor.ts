import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FeatureFlagsService } from '../../common/services/feature-flags.service.js';

/**
 * §1.2.7 — 03:00 Asia/Tashkent retention sweep. Read notifications live
 * NOTIFICATIONS_READ_RETENTION_DAYS (default 90); unread ones are dropped
 * after NOTIFICATIONS_UNREAD_RETENTION_DAYS (default 30) so inboxes don't
 * grow forever (§29). Both are runtime flags (Phase 7 §5): the settings
 * page can retune them without a restart.
 */
@Processor('notifications-cleanup', { concurrency: 1 })
export class NotificationsCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ deleted: number }> {
    const readDays = (await this.flags.get('NOTIFICATIONS_READ_RETENTION_DAYS')) as number;
    const unreadDays = (await this.flags.get('NOTIFICATIONS_UNREAD_RETENTION_DAYS')) as number;
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "notifications"
      WHERE ("readAt" IS NOT NULL AND "createdAt" < now() - make_interval(days => ${readDays}::int))
         OR ("readAt" IS NULL AND "createdAt" < now() - make_interval(days => ${unreadDays}::int))`;
    if (deleted > 0) this.logger.log(`notifications cleanup: removed ${deleted} expired row(s)`);
    return { deleted };
  }
}

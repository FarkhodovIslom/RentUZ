import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

/**
 * Phase 4 stub: subscriptions only (PrismaModule is @Global; EventBusModule
 * is @Global). Phase 6 adds the read endpoints + bell UI here.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

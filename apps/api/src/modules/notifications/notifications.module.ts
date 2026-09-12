import { Module } from '@nestjs/common';
import { NotificationListeners } from './notification-listeners.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Phase 6: full notifications module (PrismaModule and RedisModule are
 * @Global; EventBusModule is @Global). The read surface is in
 * NotificationsController, event wiring in NotificationListeners.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationListeners],
  exports: [NotificationsService],
})
export class NotificationsModule {}

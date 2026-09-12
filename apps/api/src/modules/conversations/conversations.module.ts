import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';

/**
 * §45 chat REST surface. Prisma/Redis/EventBus/Images/Storage are @Global.
 * The realtime gateway (modules/realtime) reuses these services.
 */
@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, MessagesService],
  exports: [ConversationsService, MessagesService],
})
export class ConversationsModule {}

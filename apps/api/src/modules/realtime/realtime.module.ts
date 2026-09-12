import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { SocketTicketService } from './socket-ticket.service.js';

/**
 * §28 realtime layer. TokenService comes from the @Global TokenModule;
 * Prisma/Redis/EventBus are @Global too. Conversation/message services are
 * re-exported here via ConversationsModule for the gateway's routing.
 */
@Module({
  imports: [ConversationsModule],
  controllers: [RealtimeController],
  providers: [SocketTicketService, RealtimeGateway],
  exports: [SocketTicketService],
})
export class RealtimeModule {}

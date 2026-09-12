import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { SocketTicketService } from './socket-ticket.service.js';

/**
 * §28 — the browser asks the BFF for a ticket (cookie-authenticated), then
 * opens the socket directly against the API origin (Vercel can't proxy WS).
 */
@ApiTags('realtime')
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly tickets: SocketTicketService) {}

  @Throttle({ key: 'realtime-ticket', points: 30, duration: 60 })
  @Post('ticket')
  @HttpCode(200)
  issue(@CurrentUser() user: AuthUser) {
    return this.tickets.issue(user.id);
  }
}

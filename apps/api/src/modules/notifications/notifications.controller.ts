import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  MarkReadInput,
  NotificationListQuery,
  type MarkReadInputT,
  type NotificationListQueryT,
} from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

/**
 * §46 notification read surface (all routes are auth-required by the global
 * JwtAuthGuard; every query is hard-scoped to the caller).
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query({ schema: NotificationListQuery }) query: NotificationListQueryT) {
    return this.notifications.list(user.id, query.cursor, query.limit);
  }

  /** Navbar poll (30 s + window focus) — cheap, Redis-cached. */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  /** Batch variant for the bell popover ("mark these 5 as seen"). */
  @Post('read')
  @HttpCode(200)
  markReadMany(@CurrentUser() user: AuthUser, @Body({ schema: MarkReadInput }) body: MarkReadInputT) {
    return this.notifications.markReadMany(user.id, body.ids);
  }
}

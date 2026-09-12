import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsQuery, type AnalyticsQueryT } from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * §50 — owner-scoped analytics only (`/me` style: the owner is the JWT subject,
 * there is deliberately no :ownerId param to probe). A regular USER with no
 * listings gets an all-zeros payload, not 403.
 */
@ApiTags('analytics')
@Controller('owner')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  analyticsOverview(
    @CurrentUser() user: AuthUser,
    @Query({ schema: AnalyticsQuery }) query: AnalyticsQueryT,
  ) {
    return this.analytics.ownerAnalytics(user.id, query);
  }
}

import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

/** §34/§50 owner analytics (Phase 6). PrismaModule is @Global. */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

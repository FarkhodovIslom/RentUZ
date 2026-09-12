import { Module } from '@nestjs/common';
import { AdminUsersModule } from '../admin-users/admin-users.module.js';
import { SearchModule } from '../search/search.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * §47/§61 reports: public create + admin moderation. resolve(suspendTarget)
 * reuses the AdminUsersService cascade; removeListing bumps the search cache.
 */
@Module({
  imports: [AdminUsersModule, SearchModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

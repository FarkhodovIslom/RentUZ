import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ReportCreateInput,
  ReportListQuery,
  ReportResolveBody,
  type ReportCreateInputT,
  type ReportListQueryT,
  type ReportResolveBodyT,
} from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { ReportsService } from './reports.service.js';

/**
 * §47/§61: POST /reports is user-facing (auth + 10/h throttle per user);
 * everything under /admin/reports is the moderation surface. Resolve /
 * reject / escalate are audited with distinct actions derived from the body.
 */
@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('reports')
  @Throttle({ key: 'reports', points: 10, duration: 3600 })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: ReportCreateInput }) body: ReportCreateInputT,
  ) {
    return this.reportsService.create(user.id, body);
  }

  @Roles('ADMIN')
  @Get('admin/reports')
  list(@Query({ schema: ReportListQuery }) query: ReportListQueryT) {
    return this.reportsService.listForAdmin(query);
  }

  @Roles('ADMIN')
  @Get('admin/reports/:id')
  get(@Param('id') id: string) {
    return this.reportsService.getForAdmin(id);
  }

  @Roles('ADMIN')
  @Patch('admin/reports/:id')
  @Audit((body: unknown) => `REPORT_${(body as { action?: string })?.action ?? 'RESOLVED'}`, 'REPORT')
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body({ schema: ReportResolveBody }) body: ReportResolveBodyT,
  ) {
    return this.reportsService.resolve(user.id, id, body);
  }
}

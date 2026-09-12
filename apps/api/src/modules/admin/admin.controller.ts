import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminAnalyticsQuery,
  AdminRequestsListQuery,
  AuditListQuery,
  FeatureFlagUpdate,
  type AdminAnalyticsQueryT,
  type AdminRequestsListQueryT,
  type AuditListQueryT,
  type FeatureFlagUpdateT,
} from '@rentuz/contracts';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { FeatureFlagsService, type FeatureFlagName } from '../../common/services/feature-flags.service.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';

/**
 * §49 admin surface. Every route is @Roles('ADMIN') (AdminGuard then
 * enforces ACTIVE status on the JWT claim). Mutations carry @Audit so the
 * §73 interceptor records them.
 */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** §57 platform KPIs + 30d growth series. */
  @Get('analytics')
  analytics(@Query({ schema: AdminAnalyticsQuery }) query: AdminAnalyticsQueryT) {
    return this.adminService.analytics(query);
  }

  /** §15 read-only rental-request browser. */
  @Get('requests')
  requests(@Query({ schema: AdminRequestsListQuery }) query: AdminRequestsListQueryT) {
    return this.adminService.requests(query);
  }

  /** §73 audit log viewer (cursor-paginated, filtered). */
  @Get('audit')
  auditLog(@Query({ schema: AuditListQuery }) query: AuditListQueryT) {
    return this.auditService.list(query);
  }

  /** Runtime feature flags with their source (override vs env default). */
  @Get('flags')
  async listFlags() {
    return { flags: await this.flags.all() };
  }

  /**
   * §5 runtime overrides (Redis flags:runtime:*). Production-locked flags
   * refuse `true` with 409 (FeatureFlagsService) — the startup assertions in
   * env.ts stay authoritative at boot.
   */
  @Patch('flags')
  @Audit('FLAGS_UPDATED', 'SETTINGS')
  async updateFlags(@Body({ schema: FeatureFlagUpdate }) body: FeatureFlagUpdateT) {
    for (const [name, value] of Object.entries(body) as Array<[FeatureFlagName, boolean | number]>) {
      if (value !== undefined) await this.flags.set(name, value);
    }
    return { flags: await this.flags.all() };
  }
}

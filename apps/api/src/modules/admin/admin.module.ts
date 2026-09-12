import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';

/**
 * Phase 7 admin core: platform analytics (§57), requests browser (§15),
 * audit trail (§73), runtime feature flags (§5). Verification / reports /
 * admin-users / admin-properties are sibling modules.
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService, AuditService],
  exports: [AuditService],
})
export class AdminModule {}

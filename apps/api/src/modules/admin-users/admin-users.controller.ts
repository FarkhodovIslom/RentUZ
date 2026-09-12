import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminUsersListQuery,
  BulkSuspendBody,
  SuspendBody,
  type AdminUsersListQueryT,
  type BulkSuspendBodyT,
  type SuspendBodyT,
} from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { AdminUsersService } from './admin-users.service.js';

/**
 * §58 admin users. Status changes are audited per outcome action; bulk
 * suspend is one audit row (targetId falls back to the acting admin).
 */
@ApiTags('admin-users')
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  list(@Query({ schema: AdminUsersListQuery }) query: AdminUsersListQueryT) {
    return this.adminUsers.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.adminUsers.get(id);
  }

  @Patch(':id/status')
  @Audit(
    (body: unknown) =>
      `USER_${
        (body as { status?: string })?.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : (body as { status?: string })?.status === 'DELETED'
            ? 'DELETED'
            : 'ACTIVATED'
      }`,
    'USER',
  )
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body({ schema: SuspendBody }) body: SuspendBodyT,
  ) {
    return this.adminUsers.setStatus(user.id, id, body);
  }

  @Post('bulk/suspend')
  @Audit('USER_BULK_SUSPENDED', 'USER')
  bulkSuspend(
    @CurrentUser() user: AuthUser,
    @Body({ schema: BulkSuspendBody }) body: BulkSuspendBodyT,
  ) {
    return this.adminUsers.bulkSuspend(user.id, body.userIds, body.reason);
  }
}

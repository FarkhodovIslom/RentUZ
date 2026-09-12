import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

/**
 * §58 admin user management. The suspend/activate cascade lives in
 * AdminUsersService and is reused by reports.resolve(suspendTarget).
 */
@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}

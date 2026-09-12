import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  RejectBody,
  RequestInfoBody,
  VerificationQueueQuery,
  type RejectBodyT,
  type RequestInfoBodyT,
  type VerificationQueueQueryT,
} from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { VerificationService } from './verification.service.js';

/**
 * §60 verification queue surface. Approve/reject/request-info are audited;
 * claim is a soft Redis action ("audit'siz" per 7_Phase.md §1.2 item 7).
 */
@ApiTags('verification')
@Roles('ADMIN')
@Controller('admin/verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  queue(@Query({ schema: VerificationQueueQuery }) query: VerificationQueueQueryT) {
    return this.verification.queue(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.verification.get(id);
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.verification.claim(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Audit('PROPERTY_APPROVED', 'PROPERTY')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.verification.approve(id, user.id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Audit('PROPERTY_REJECTED', 'PROPERTY')
  reject(@Param('id') id: string, @Body({ schema: RejectBody }) body: RejectBodyT) {
    return this.verification.reject(id, body.reason);
  }

  @Post(':id/request-info')
  @HttpCode(200)
  @Audit('VERIFICATION_INFO_REQUESTED', 'PROPERTY')
  requestInfo(@Param('id') id: string, @Body({ schema: RequestInfoBody }) body: RequestInfoBodyT) {
    return this.verification.requestInfo(id, body.message);
  }
}

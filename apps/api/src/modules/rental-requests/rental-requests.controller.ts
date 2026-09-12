import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateRentalRequestInput,
  type CreateRentalRequestInputT,
  RentalRequestListQuery,
  type RentalRequestListQueryT,
  UpdateRentalRequestInput,
  type UpdateRentalRequestInputT,
} from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { RentalRequestsService } from './rental-requests.service.js';

/**
 * §44 Rental request API. PATCH carries the transition; §54 role gates
 * (owner ACCEPT/REJECT, tenant CANCEL) live in the service.
 */
@ApiTags('rental-requests')
@Controller('rental-requests')
export class RentalRequestsController {
  constructor(private readonly requests: RentalRequestsService) {}

  @Throttle({ key: 'rental-requests-create', points: 10, duration: 60 })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateRentalRequestInput }) body: CreateRentalRequestInputT,
  ) {
    return this.requests.create(user.id, body);
  }

  @Get('my')
  listMy(
    @CurrentUser() user: AuthUser,
    @Query({ schema: RentalRequestListQuery }) query: RentalRequestListQueryT,
  ) {
    return this.requests.listMy(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.findOne(user.id, id);
  }

  @Patch(':id')
  @HttpCode(200)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body({ schema: UpdateRentalRequestInput }) body: UpdateRentalRequestInputT,
  ) {
    return this.requests.update(user.id, id, body);
  }
}

/** §44 owner views — same service, ownership-gated inside. */
@ApiTags('owner-rental-requests')
@Controller('owner/rental-requests')
export class OwnerRentalRequestsController {
  constructor(private readonly requests: RentalRequestsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: RentalRequestListQuery }) query: RentalRequestListQueryT,
  ) {
    return this.requests.listForOwner(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.findOne(user.id, id);
  }
}

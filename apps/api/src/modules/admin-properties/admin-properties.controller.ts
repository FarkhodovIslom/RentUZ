import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminPropertiesListQuery,
  SetPropertyStatusBody,
  type AdminPropertiesListQueryT,
  type SetPropertyStatusBodyT,
} from '@rentuz/contracts';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { AdminPropertiesService } from './admin-properties.service.js';

/** §59 admin properties — list, detail, status actions (all audited). */
@ApiTags('admin-properties')
@Roles('ADMIN')
@Controller('admin/properties')
export class AdminPropertiesController {
  constructor(private readonly adminProperties: AdminPropertiesService) {}

  @Get()
  list(@Query({ schema: AdminPropertiesListQuery }) query: AdminPropertiesListQueryT) {
    return this.adminProperties.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.adminProperties.get(id);
  }

  @Patch(':id/status')
  @Audit(
    (body: unknown) =>
      `PROPERTY_${
        (body as { status?: string })?.status === 'PAUSED'
          ? 'PAUSED'
          : (body as { status?: string })?.status === 'REJECTED'
            ? 'REJECTED'
            : (body as { status?: string })?.status === 'DELETED'
              ? 'DELETED'
              : 'RESUMED'
      }`,
    'PROPERTY',
  )
  setStatus(@Param('id') id: string, @Body({ schema: SetPropertyStatusBody }) body: SetPropertyStatusBodyT) {
    return this.adminProperties.setStatus(id, body);
  }
}

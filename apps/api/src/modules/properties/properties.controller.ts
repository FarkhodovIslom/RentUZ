import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PropertyUpdateInput, type PropertyUpdateInputT, type PropertyDetailDTOT } from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { PropertiesService } from './properties.service.js';

@ApiTags('properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.properties.findOwn(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser) {
    return this.properties.createDraft(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<PropertyDetailDTOT> {
    return this.properties.findOneForOwner(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body({ schema: PropertyUpdateInput }) body: PropertyUpdateInputT,
  ) {
    return this.properties.updateDraft(id, user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.properties.remove(id, user.id);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.properties.submit(id, user.id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.properties.pause(id, user.id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.properties.resume(id, user.id);
  }
}

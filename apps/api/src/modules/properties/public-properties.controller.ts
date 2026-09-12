import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LocationDTO, type LocationDTOT, type PublicPropertyDetailDTOT, type PropertyCardDTOT } from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { PublicPropertiesService } from './public-properties.service.js';
import { PropertyViewsService } from './views.service.js';

@ApiTags('public')
@Controller('public')
export class PublicPropertiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicProperties: PublicPropertiesService,
    private readonly views: PropertyViewsService,
  ) {}

  /**
   * Full public details (§20). Owner viewing their own property does not
   * count; anonymous visitors are deduped by the `rz_sid` cookie.
   */
  @Public()
  @Get('properties/:slugOrId')
  async details(
    @Param('slugOrId') slugOrId: string,
    @Req() req: Request & { user?: AuthUser },
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicPropertyDetailDTOT> {
    const sessionId = this.views.resolveSessionId(req, res);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return this.publicProperties.details(slugOrId, { userId: req.user?.id ?? null, sessionId }, (propertyId, ownerId) =>
      this.views.record(propertyId, ownerId, req.user?.id ?? null, sessionId),
    );
  }

  @Public()
  @Get('properties/:slugOrId/similar')
  similar(@Param('slugOrId') slugOrId: string): Promise<PropertyCardDTOT[]> {
    return this.publicProperties.similarFor(slugOrId);
  }

  @Public()
  @Get('locations')
  async locations(): Promise<LocationDTOT[]> {
    const rows = await this.prisma.locations.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
    return rows.map((l) => LocationDTO.parse(l));
  }
}

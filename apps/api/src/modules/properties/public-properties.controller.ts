import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { LocationDTO, type LocationDTOT, type PropertyCardDTOT } from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

const PUBLIC_BASE_URL = (process.env.PUBLIC_STORAGE_BASE_URL ?? 'http://localhost:9000/rentuz-public').replace(
  /\/$/,
  '',
);

@ApiTags('public')
@Controller('public')
export class PublicPropertiesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Minimal ACTIVE listing for the rentals grid (Phase 3 adds filters). */
  @Public()
  @Get('properties')
  async list(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ): Promise<{ data: PropertyCardDTOT[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (p - 1) * l;

    const [rows, total] = await Promise.all([
      this.prisma.properties.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: l,
        include: { region: true },
      }),
      this.prisma.properties.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      data: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        price: Number(p.price),
        priceUzs: Number(p.priceUzs),
        currency: p.currency,
        type: p.type,
        rooms: p.rooms,
        area: Number(p.area),
        address: p.address,
        mainImageUrl: p.mainImageUrl
          ? p.mainImageUrl.startsWith('http')
            ? p.mainImageUrl
            : `${PUBLIC_BASE_URL}/${p.mainImageUrl}`
          : null,
        regionName: p.region?.name ?? null,
        isVerified: p.isVerified,
        createdAt: p.createdAt,
      })),
      meta: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
    };
  }

  @Public()
  @Get('locations')
  async locations(): Promise<LocationDTOT[]> {
    const rows = await this.prisma.locations.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
    return rows.map((l) => LocationDTO.parse(l));
  }
}

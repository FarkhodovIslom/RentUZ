import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildPaginationMeta,
  type PropertyCardDTOT,
  type SearchInputT,
} from '@rentuz/contracts';
import { toCardDTO, type CardRow } from '../properties/property-card.mapper.js';

/** §43 Favorites API. Geo radius filters are ignored on favorites (no UI). */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, input: SearchInputT): Promise<{
    data: PropertyCardDTOT[];
    meta: ReturnType<typeof buildPaginationMeta>;
  }> {
    const favoriteIds = await this.prisma.favorites.findMany({
      where: { userId },
      select: { propertyId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (favoriteIds.length === 0) {
      return { data: [], meta: buildPaginationMeta(input.page, input.limit, 0) };
    }
    const ids = favoriteIds.map((f) => f.propertyId);

    const where: Prisma.propertiesWhereInput = {
      id: { in: ids },
      status: 'ACTIVE',
      ...(input.city ? { regionId: input.city } : {}),
      ...(input.district ? { districtId: input.district } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.rooms !== undefined ? { rooms: { gte: input.rooms } } : {}),
      ...(input.bedrooms !== undefined ? { bedrooms: { gte: input.bedrooms } } : {}),
      ...(input.bathrooms !== undefined ? { bathrooms: { gte: input.bathrooms } } : {}),
      ...(input.minPrice !== undefined || input.maxPrice !== undefined
        ? {
            priceUzs: {
              ...(input.minPrice !== undefined ? { gte: input.minPrice } : {}),
              ...(input.maxPrice !== undefined ? { lte: input.maxPrice } : {}),
            },
          }
        : {}),
      ...(input.minArea !== undefined || input.maxArea !== undefined
        ? {
            area: {
              ...(input.minArea !== undefined ? { gte: input.minArea } : {}),
              ...(input.maxArea !== undefined ? { lte: input.maxArea } : {}),
            },
          }
        : {}),
      ...(input.minFloor !== undefined ? { floor: { gte: input.minFloor } } : {}),
      ...(input.furnished ? { furnished: input.furnished } : {}),
      ...(input.pets ? { petsAllowed: true } : {}),
      ...(input.smoking ? { smokingAllowed: true } : {}),
      ...(input.verified ? { isVerified: true } : {}),
    };

    const orderBy: Prisma.propertiesOrderByWithRelationInput[] =
      input.sort === 'price_asc'
        ? [{ priceUzs: 'asc' }]
        : input.sort === 'price_desc'
          ? [{ priceUzs: 'desc' }]
          : input.sort === 'popular'
            ? [{ views: 'desc' }]
            : [{ createdAt: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.properties.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: { images: { take: 1, orderBy: { ordering: 'asc' } }, region: true },
      }),
      this.prisma.properties.count({ where }),
    ]);

    return {
      data: rows.map((row) => toCardDTO(row as CardRow)),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  /** Idempotent add — unique(userId, propertyId) makes repeats safe. */
  async add(userId: string, propertyId: string): Promise<{ propertyId: string }> {
    const property = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, status: true },
    });
    // 404 for missing/non-ACTIVE/own property — §43 + Phase 7 adds a clearer
    // CANNOT_FAVORITE_OWN domain code.
    if (!property || property.status !== 'ACTIVE' || property.ownerId === userId) {
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND' });
    }
    try {
      await this.prisma.favorites.create({ data: { userId, propertyId } });
    } catch (error) {
      const known = error as { code?: string };
      if (known.code !== 'P2002') throw error; // duplicate → already a favorite
    }
    return { propertyId };
  }

  async remove(userId: string, propertyId: string): Promise<{ propertyId: string }> {
    await this.prisma.favorites.deleteMany({ where: { userId, propertyId } });
    return { propertyId };
  }
}

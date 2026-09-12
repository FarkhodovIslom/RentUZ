import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminPropertyDetailDTOT,
  AdminPropertyRowDTOT,
  AdminPropertiesListQueryT,
} from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventBusService } from '../../common/services/event-bus.service.js';
import { SearchCacheService } from '../search/search-cache.service.js';
import { cursorMeta, parseCursor } from '../../common/utils/cursor.js';

/**
 * §59 admin property management. Allowed transitions: PAUSED (from
 * ACTIVE/RENTED — sets pausedReason='ADMIN'), REJECTED (from any non-DELETED,
 * reason mandatory), ACTIVE (un-pause only, blocked while the owner is
 * suspended), DELETED (from any). Every transition bumps the search cache
 * version — public visibility follows the status machine.
 */
interface SetStatusInput {
  status: 'ACTIVE' | 'PAUSED' | 'REJECTED' | 'DELETED';
  reason?: string;
}

@Injectable()
export class AdminPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly searchCache: SearchCacheService,
  ) {}

  async list(
    query: AdminPropertiesListQueryT,
  ): Promise<{ data: AdminPropertyRowDTOT[]; meta: ReturnType<typeof cursorMeta> }> {
    const { before } = parseCursor(query.cursor);
    const rows = await this.prisma.properties.findMany({
      where: {
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search } },
                { address: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.verification ? { isVerified: query.verification === 'VERIFIED' } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.createdFrom || query.createdTo
          ? {
              createdAt: {
                ...(query.createdFrom ? { gte: new Date(`${query.createdFrom}T00:00:00+05:00`) } : {}),
                ...(query.createdTo ? { lt: new Date(`${query.createdTo}T00:00:00+05:00`) } : {}),
              },
            }
          : {}),
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { owner: { select: { id: true, name: true, phone: true } } },
    });

    const meta = cursorMeta(rows, query.limit);
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        type: row.type,
        status: row.status,
        pausedReason: row.pausedReason,
        isVerified: row.isVerified,
        price: Number(row.price),
        currency: row.currency,
        priceUzs: Number(row.priceUzs),
        mainImageUrl: row.mainImageUrl,
        views: row.views,
        createdAt: row.createdAt,
        owner: row.owner,
      })),
      meta,
    };
  }

  async get(propertyId: string): Promise<AdminPropertyDetailDTOT> {
    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: { ordering: 'asc' } },
        region: true,
        district: true,
        owner: { select: { id: true, name: true, phone: true, status: true } },
      },
    });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();

    return {
      id: prop.id,
      ownerId: prop.ownerId,
      slug: prop.slug,
      title: prop.title,
      description: prop.description,
      type: prop.type,
      price: Number(prop.price),
      priceUzs: Number(prop.priceUzs),
      currency: prop.currency,
      period: prop.period,
      rooms: prop.rooms,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      area: Number(prop.area),
      floor: prop.floor,
      totalFloors: prop.totalFloors,
      renovation: prop.renovation,
      furnished: prop.furnished,
      petsAllowed: prop.petsAllowed,
      smokingAllowed: prop.smokingAllowed,
      address: prop.address,
      lat: prop.lat,
      lng: prop.lng,
      regionId: prop.regionId,
      districtId: prop.districtId,
      amenities: (prop.amenities as string[]) ?? [],
      status: prop.status,
      pausedReason: prop.pausedReason,
      isVerified: prop.isVerified,
      views: prop.views,
      mainImageUrl: prop.mainImageUrl,
      images: prop.images.map((img) => ({
        id: img.id,
        url: img.url,
        thumbUrl: img.thumbUrl,
        width: img.width,
        height: img.height,
        ordering: img.ordering,
      })),
      createdAt: prop.createdAt,
      rejectionReason: prop.rejectionReason,
      submittedAt: prop.submittedAt,
      verifiedAt: prop.verifiedAt,
      verifiedBy: prop.verifiedBy,
      owner: prop.owner,
    };
  }

  async setStatus(propertyId: string, input: SetStatusInput): Promise<{ id: string; status: string; pausedReason: string | null }> {
    if (input.status === 'REJECTED' && (!input.reason || input.reason.trim().length < 10)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Rad etish uchun izoh majburiy (kamida 10 belgi)',
      });
    }

    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: { owner: { select: { id: true, status: true } } },
    });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.status === input.status) {
      return { id: prop.id, status: prop.status, pausedReason: prop.pausedReason };
    }

    switch (input.status) {
      case 'PAUSED': {
        if (prop.status !== 'ACTIVE' && prop.status !== 'RENTED') {
          throw new ConflictException({ code: 'CONFLICT', message: 'Faqat faol/ijaraga berilgan e\'lon to‘xtatiladi' });
        }
        break;
      }
      case 'ACTIVE': {
        if (prop.status !== 'PAUSED') {
          throw new ConflictException({ code: 'CONFLICT', message: 'Faqat to‘xtatilgan e\'lon qayta faollashtiriladi' });
        }
        if (prop.pausedReason === 'OWNER_SUSPENDED' && prop.owner.status === 'SUSPENDED') {
          throw new ConflictException({
            code: 'OWNER_SUSPENDED',
            message: 'Egasi to‘xtatilgan — avval egasini faollashtiring',
          });
        }
        break;
      }
      case 'REJECTED':
      case 'DELETED':
        break;
    }

    const updated = await this.prisma.properties.update({
      where: { id: propertyId },
      data: {
        status: input.status,
        pausedReason:
          input.status === 'PAUSED' ? 'ADMIN' : input.status === 'ACTIVE' ? null : prop.pausedReason,
        ...(input.status === 'REJECTED' && input.reason ? { rejectionReason: input.reason } : {}),
      },
      select: { id: true, status: true, pausedReason: true },
    });
    await this.searchCache.bumpVersion();

    if (input.status === 'REJECTED' && input.reason) {
      // §30: owner learns their listing was rejected by moderation.
      this.events.emit('property.rejected', {
        propertyId,
        ownerId: prop.ownerId,
        title: prop.title,
        reason: input.reason,
      });
    }
    return updated;
  }
}

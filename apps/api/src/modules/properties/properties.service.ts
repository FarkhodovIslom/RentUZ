import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventBusService } from '../../common/services/event-bus.service.js';
import { FxService } from '../fx/fx.service.js';
import { SearchCacheService } from '../search/search-cache.service.js';
import { GeoRepository } from './geo.repository.js';
import { SlugService } from './slug.service.js';
import { PropertyStatusService } from './status.service.js';
import { type PropertyDetailDTOT, type PropertyUpdateInputT } from '@rentuz/contracts';
import type {
  propertiesModel,
  propertyImagesModel,
  locationsModel,
} from '../../generated/prisma/models.js';

type PropertyWithRelations = propertiesModel & {
  images: propertyImagesModel[];
  region: locationsModel | null;
};

const FULL_VALIDATION_KEYS = [
  'title',
  'description',
  'type',
  'price',
  'rooms',
  'bedrooms',
  'bathrooms',
  'area',
  'address',
  'regionId',
  'amenities',
] as const;

const PUBLIC_BASE_URL = process.env.PUBLIC_STORAGE_BASE_URL ?? 'http://localhost:9000/rentuz-public';

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: PropertyStatusService,
    private readonly slugs: SlugService,
    private readonly geo: GeoRepository,
    private readonly fx: FxService,
    private readonly searchCache: SearchCacheService,
    private readonly events: EventBusService,
  ) {}

  async createDraft(ownerId: string): Promise<{ id: string }> {
    // Phase 1 schema has NOT NULL on title/description/etc — empty-DRAFT
    // placeholders (2_Phase.md §2). Submit gate replaces them.
    const slug = await this.slugs.unique('property');
    const created = await this.prisma.properties.create({
      data: {
        ownerId,
        slug,
        title: '',
        description: '',
        type: 'APARTMENT',
        price: '0',
        priceUzs: BigInt(0),
        period: 'month',
        rooms: 0,
        bedrooms: 0,
        bathrooms: 0,
        area: '0',
        address: '',
        amenities: [],
        status: 'DRAFT',
      },
      select: { id: true },
    });
    return created;
  }

  async findOwn(ownerId: string) {
    return this.prisma.properties.findMany({
      where: { ownerId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      include: { images: { take: 1, orderBy: { ordering: 'asc' } } },
    });
  }

  async findOneForOwner(propertyId: string, ownerId: string) {
    return this.findOneInternal(propertyId, ownerId);
  }

  private async findOneInternal(propertyId: string, ownerId: string) {
    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: { ordering: 'asc' } },
        region: true,
      },
    });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    return this.toDetail(prop);
  }

  async updateDraft(
    propertyId: string,
    ownerId: string,
    input: PropertyUpdateInputT,
  ): Promise<{ id: string; status: string }> {
    const prop = await this.prisma.properties.findUnique({ where: { id: propertyId } });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    if (prop.status !== 'DRAFT') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Faqat DRAFT tahrirlanadi' });
    }

    const updates: Record<string, unknown> = { ...input };
    if (typeof input.price === 'number' || typeof input.currency === 'string') {
      const amount = typeof input.price === 'number' ? input.price : Number(prop.price);
      const currency = (input.currency as 'UZS' | 'USD' | undefined) ?? (prop.currency as 'UZS' | 'USD');
      updates.priceUzs = await this.fx.toUzs(amount, currency);
    }
    if (typeof input.title === 'string' && input.title.length >= 8) {
      updates.slug = await this.slugs.unique(input.title);
    }

    // Prisma 7's driver adapter wraps every `$transaction` callback in an
    // interactive transaction that defaults to a 5s timeout — our geo write
    // (raw SQL via the pg adapter) reliably blows that, so we run the two
    // statements sequentially without an explicit transaction. The geo
    // statement is the last thing the user sees; partial failure leaves the
    // column row updated and only the PostGIS point empty (no data loss, and
    // the next /submit or /pause will not retry the geo write).
    const updated = await this.prisma.properties.update({
      where: { id: propertyId },
      data: updates,
      select: { id: true, status: true },
    });
    if (typeof input.lat === 'number' && typeof input.lng === 'number') {
      await this.geo.setLocation(propertyId, input.lng, input.lat);
    }
    return updated;
  }

  async submit(propertyId: string, ownerId: string): Promise<{ status: string }> {
    const prop = await this.prisma.properties.findUnique({ where: { id: propertyId } });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    // Submit gate: every required field must be valid.
    for (const key of FULL_VALIDATION_KEYS) {
      const value = (prop as unknown as Record<string, unknown>)[key];
      if (value === null || value === undefined || value === '' ||
          (Array.isArray(value) && value.length === 0)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: `E'lon tasdiqlash uchun "${key}" to‘ldirilishi kerak`,
        });
      }
    }
    this.status.assert(prop.status, 'PENDING_VERIFICATION');

    const autoApprove = process.env.AUTO_APPROVE_LISTINGS === 'true';
    const nextStatus = autoApprove ? 'ACTIVE' : 'PENDING_VERIFICATION';
    if (autoApprove) this.status.assert(prop.status, 'ACTIVE');

    const result = await this.prisma.properties.update({
      where: { id: propertyId },
      data: {
        status: nextStatus,
        submittedAt: new Date(),
        ...(autoApprove ? { isVerified: true, verifiedAt: new Date() } : {}),
      },
      select: { status: true },
    });
    await this.searchCache.bumpVersion();
    if (autoApprove) {
      // §30: owner learns their listing passed verification. Phase 7's admin
      // moderation flow will emit the same event (idempotency key dedupes).
      this.events.emit('property.verified', { propertyId, ownerId });
    }
    return result;
  }

  /**
   * §34/§84 price-change trigger: only published listings have a public price
   * worth alerting favoriting users about (DRAFT edits go through updateDraft).
   * Emits property.price_changed → NotificationListeners fans out.
   */
  async changePrice(
    propertyId: string,
    ownerId: string,
    input: { price: number; currency: 'UZS' | 'USD' },
  ): Promise<{ id: string; priceUzs: number; oldPriceUzs: number }> {
    const prop = await this.prisma.properties.findUnique({ where: { id: propertyId } });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    if (!['ACTIVE', 'PAUSED', 'RENTED'].includes(prop.status)) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Narx faqat e\'lon qilingan (ACTIVE/PAUSED/RENTED) uchun o\'zgartiriladi',
      });
    }
    const oldPriceUzs = Number(prop.priceUzs);
    const newPriceUzs = Number(await this.fx.toUzs(input.price, input.currency));
    await this.prisma.properties.update({
      where: { id: propertyId },
      data: { price: String(input.price), currency: input.currency, priceUzs: BigInt(newPriceUzs) },
    });
    await this.searchCache.bumpVersion();
    if (newPriceUzs !== oldPriceUzs) {
      this.events.emit('property.price_changed', {
        propertyId,
        ownerId,
        title: prop.title,
        oldPriceUzs,
        newPriceUzs,
      });
    }
    return { id: propertyId, priceUzs: newPriceUzs, oldPriceUzs };
  }

  async pause(propertyId: string, ownerId: string): Promise<{ status: string }> {
    return this.simpleTransition(propertyId, ownerId, 'PAUSED');
  }

  async resume(propertyId: string, ownerId: string): Promise<{ status: string }> {
    return this.simpleTransition(propertyId, ownerId, 'ACTIVE');
  }

  async remove(propertyId: string, ownerId: string): Promise<void> {
    const prop = await this.prisma.properties.findUnique({ where: { id: propertyId } });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    this.status.assert(prop.status, 'DELETED');
    await this.prisma.properties.update({
      where: { id: propertyId },
      data: { status: 'DELETED' },
    });
    await this.searchCache.bumpVersion();
  }

  private async simpleTransition(propertyId: string, ownerId: string, to: 'PAUSED' | 'ACTIVE') {
    const prop = await this.prisma.properties.findUnique({ where: { id: propertyId } });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    this.status.assert(prop.status, to);
    const result = await this.prisma.properties.update({
      where: { id: propertyId },
      data: { status: to },
      select: { status: true },
    });
    await this.searchCache.bumpVersion();
    return result;
  }

  private toDetail(prop: PropertyWithRelations): PropertyDetailDTOT {
    const publicBaseUrl = PUBLIC_BASE_URL.replace(/\/$/, '');
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
      isVerified: prop.isVerified,
      views: prop.views,
      mainImageUrl: prop.mainImageUrl,
      images: (prop.images ?? []).map((img: propertyImagesModel) => ({
        id: img.id,
        url: img.url.startsWith('http') ? img.url : `${publicBaseUrl}/${img.url}`,
        thumbUrl: img.thumbUrl
          ? img.thumbUrl.startsWith('http')
            ? img.thumbUrl
            : `${publicBaseUrl}/${img.thumbUrl}`
          : null,
        width: img.width,
        height: img.height,
        ordering: img.ordering,
      })),
      createdAt: prop.createdAt,
    };
  }
}

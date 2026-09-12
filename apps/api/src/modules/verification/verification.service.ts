import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  VerificationDetailDTOT,
  VerificationQueueItemDTOT,
  VerificationQueueQueryT,
} from '@rentuz/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { EventBusService } from '../../common/services/event-bus.service.js';
import { SearchCacheService } from '../search/search-cache.service.js';
import { cursorMeta, parseCursor } from '../../common/utils/cursor.js';

/**
 * §60 verification queue. PENDING→REVIEWING is a soft claim held in Redis
 * (verification:claim:<id>, TTL 7 d) — no PropertyStatus value is added and
 * no audit row is written for claiming ("audit'siz" per 7_Phase.md §1.2).
 * Approve / reject are audited at the controller via @Audit and emit the
 * Phase 6 property.verified / property.rejected events.
 */
const CLAIM_PREFIX = 'verification:claim:';
const CLAIM_TTL_SECONDS = 7 * 24 * 3600;

export interface ClaimInfo {
  adminId: string;
  adminName: string;
  at: Date;
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventBusService,
    private readonly searchCache: SearchCacheService,
  ) {}

  // ── queue ──

  async queue(
    query: VerificationQueueQueryT,
  ): Promise<{ data: VerificationQueueItemDTOT[]; meta: ReturnType<typeof cursorMeta> }> {
    const statusWhere =
      query.status === 'PENDING' || query.status === 'REVIEWING'
        ? { status: 'PENDING_VERIFICATION' as const }
        : query.status === 'APPROVED'
          ? { status: 'ACTIVE' as const, isVerified: true }
          : { status: 'REJECTED' as const };

    const { before } = parseCursor(query.cursor);
    // Cursor walks the same field the tab sorts by (keyset over field+id).
    const orderByField: 'submittedAt' | 'verifiedAt' | 'updatedAt' =
      query.status === 'APPROVED' ? 'verifiedAt' : query.status === 'REJECTED' ? 'updatedAt' : 'submittedAt';
    const orderBy: Prisma.propertiesOrderByWithRelationInput[] =
      query.status === 'APPROVED'
        ? [{ verifiedAt: 'desc' }, { id: 'desc' }]
        : query.status === 'REJECTED'
          ? [{ updatedAt: 'desc' }, { id: 'desc' }]
          : [{ submittedAt: 'desc' }, { id: 'desc' }];

    const rows = await this.prisma.properties.findMany({
      where: {
        ...statusWhere,
        ...(query.type ? { type: query.type } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(before
          ? {
              OR: [
                { [orderByField]: { lt: before.createdAt } } as Prisma.propertiesWhereInput,
                { [orderByField]: before.createdAt, id: { lt: before.id } } as Prisma.propertiesWhereInput,
              ],
            }
          : {}),
      },
      orderBy,
      take: query.limit + 1,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        region: { select: { name: true } },
        _count: { select: { images: true } },
      },
    });

    const claims = await this.readClaims(rows.map((r) => r.id));

    // REVIEWING/PENDING filter on claim presence; REVIEWING pagination stays
    // in-memory (MVP queue volume).
    const filtered =
      query.status === 'PENDING'
        ? rows.filter((row) => !claims.get(row.id))
        : query.status === 'REVIEWING'
          ? rows.filter((row) => claims.get(row.id))
          : rows;

    const meta = cursorMeta(filtered, query.limit);
    const page = filtered.slice(0, query.limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        type: row.type,
        price: Number(row.price),
        currency: row.currency,
        priceUzs: Number(row.priceUzs),
        mainImageUrl: row.mainImageUrl,
        imageCount: row._count.images,
        regionName: row.region?.name ?? null,
        submittedAt: row.submittedAt,
        owner: row.owner,
        claim: claims.get(row.id) ?? null,
      })),
      meta: { ...meta, limit: query.limit },
    };
  }

  async get(propertyId: string): Promise<VerificationDetailDTOT> {
    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: { ordering: 'asc' } },
        region: true,
        owner: true,
      },
    });
    // The schema has no `district` relation (only districtId) — resolve the
    // name separately when present.
    const district = prop?.districtId
      ? await this.prisma.locations.findUnique({ where: { id: prop.districtId }, select: { name: true } })
      : null;
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    // The review screen serves the queue + post-outcome reference; only
    // DRAFT/DELETED rows are unreachable.
    if (prop.status === 'DRAFT') throw new NotFoundException();

    const [priorViolations, totalListings, claim] = await Promise.all([
      this.countPriorViolations(prop.ownerId),
      this.prisma.properties.count({ where: { ownerId: prop.ownerId, status: { not: 'DELETED' } } }),
      this.readClaim(prop.id),
    ]);

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
      regionName: prop.region?.name ?? null,
      districtName: district?.name ?? null,
      ownerCard: {
        id: prop.owner.id,
        name: prop.owner.name,
        phone: prop.owner.phone,
        memberSince: prop.owner.createdAt,
        isPhoneVerified: prop.owner.isPhoneVerified,
        canListProperties: prop.owner.canListProperties,
        priorViolations,
        totalListings,
      },
      claim,
    };
  }

  // ── actions ──

  async claim(propertyId: string, adminId: string): Promise<{ id: string; claim: ClaimInfo }> {
    const prop = await this.prisma.properties.findUnique({ where: { id: propertyId } });
    if (!prop || prop.status !== 'PENDING_VERIFICATION') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Faqat kutish holatidagi e\'lon olinadi' });
    }
    const admin = await this.prisma.users.findUnique({
      where: { id: adminId },
      select: { name: true },
    });
    const claim: ClaimInfo = { adminId, adminName: admin?.name ?? adminId, at: new Date() };
    await this.redis.client.set(
      `${CLAIM_PREFIX}${propertyId}`,
      JSON.stringify({ adminId: claim.adminId, adminName: claim.adminName, at: claim.at.toISOString() }),
      'EX',
      CLAIM_TTL_SECONDS,
    );
    return { id: propertyId, claim };
  }

  async approve(propertyId: string, adminId: string): Promise<{ id: string; status: string; isVerified: boolean }> {
    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: { owner: { select: { id: true, status: true } } },
    });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.status !== 'PENDING_VERIFICATION') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Faqat PENDING_VERIFICATION holatidagi e\'lon tasdiqlanadi' });
    }
    // §54: owner suspension blocks the approval — fresh DB read, 409, no change.
    if (prop.owner.status === 'SUSPENDED') {
      throw new ConflictException({ code: 'OWNER_SUSPENDED', message: 'Egasi to‘xtatilgan — e\'lon tasdiqlanmaydi' });
    }

    const verifiedAt = new Date();
    const updated = await this.prisma.properties.update({
      where: { id: propertyId },
      data: { status: 'ACTIVE', isVerified: true, verifiedAt, verifiedBy: adminId },
      select: { id: true, status: true, isVerified: true },
    });
    await this.searchCache.bumpVersion();
    await this.releaseClaim(propertyId);
    // Phase 6 listener enqueues the PROPERTY_VERIFIED notification (idempotent).
    this.events.emit('property.verified', { propertyId, ownerId: prop.ownerId, title: prop.title });
    return updated;
  }

  async reject(propertyId: string, reason: string): Promise<{ id: string; status: string; isVerified: boolean }> {
    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: { owner: { select: { id: true } } },
    });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.status !== 'PENDING_VERIFICATION') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Faqat PENDING_VERIFICATION holatidagi e\'lon rad etiladi' });
    }

    const updated = await this.prisma.properties.update({
      where: { id: propertyId },
      data: { status: 'REJECTED', rejectionReason: reason },
      select: { id: true, status: true, isVerified: true },
    });
    await this.searchCache.bumpVersion();
    await this.releaseClaim(propertyId);
    this.events.emit('property.rejected', { propertyId, ownerId: prop.ownerId, title: prop.title, reason });
    return updated;
  }

  /** §60 requestInfo — no status change; the item stays in the queue. */
  async requestInfo(
    propertyId: string,
    message: string,
  ): Promise<{ id: string; status: string; isVerified: boolean }> {
    const prop = await this.prisma.properties.findUnique({
      where: { id: propertyId },
      include: { owner: { select: { id: true } } },
    });
    if (!prop || prop.status === 'DELETED') throw new NotFoundException();
    if (prop.status !== 'PENDING_VERIFICATION') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Faqat kutish holatidagi e\'londan qo‘shimcha ma\'lumot so‘raladi' });
    }
    this.events.emit('verification.info_requested', {
      propertyId,
      ownerId: prop.ownerId,
      title: prop.title,
      message,
    });
    return { id: propertyId, status: prop.status, isVerified: prop.isVerified };
  }

  // ── helpers ──

  /** Reports against the owner directly or against any of their properties. */
  private async countPriorViolations(ownerId: string): Promise<number> {
    const [asUser, asOwner] = await Promise.all([
      this.prisma.reports.count({ where: { targetType: 'USER', targetId: ownerId } }),
      this.prisma.$queryRaw<number>`
        SELECT count(*)::int FROM "reports" r
        JOIN "properties" p ON p.id = r."targetId"
        WHERE r."targetType" = 'PROPERTY' AND p."ownerId" = ${ownerId}::uuid`,
    ]);
    return asUser + Number(asOwner);
  }

  private async readClaim(propertyId: string): Promise<ClaimInfo | null> {
    const raw = await this.redis.client.get(`${CLAIM_PREFIX}${propertyId}`).catch(() => null);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { adminId: string; adminName: string; at: string };
      return { adminId: parsed.adminId, adminName: parsed.adminName, at: new Date(parsed.at) };
    } catch {
      return null;
    }
  }

  private async readClaims(propertyIds: string[]): Promise<Map<string, ClaimInfo>> {
    const out = new Map<string, ClaimInfo>();
    if (propertyIds.length === 0) return out;
    const keys = propertyIds.map((id) => `${CLAIM_PREFIX}${id}`);
    const values = await this.redis.client.mget(keys).catch(() => keys.map(() => null));
    propertyIds.forEach((id, index) => {
      const raw = values[index];
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { adminId: string; adminName: string; at: string };
        out.set(id, { adminId: parsed.adminId, adminName: parsed.adminName, at: new Date(parsed.at) });
      } catch {
        /* corrupt claim — ignore */
      }
    });
    return out;
  }

  private async releaseClaim(propertyId: string): Promise<void> {
    await this.redis.client.del(`${CLAIM_PREFIX}${propertyId}`).catch(() => undefined);
  }
}

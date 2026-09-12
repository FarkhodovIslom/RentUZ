import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicPropertyDetailDTOT, PropertyCardDTOT } from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toCardDTO, publicStorageBaseUrl, type CardRow } from './property-card.mapper.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DetailRow = CardRow & {
  description: string;
  period: string;
  bedrooms: number;
  bathrooms: number;
  floor: number | null;
  totalFloors: number | null;
  renovation: string | null;
  furnished: 'NONE' | 'PARTIAL' | 'FULL';
  petsAllowed: boolean;
  smokingAllowed: boolean;
  lat: number | null;
  lng: number | null;
  districtId: string | null;
  amenities: unknown;
  isVerified: boolean;
  views: number;
  images: CardRow['images'];
  owner: {
    id: string;
    name: string;
    avatar: string | null;
    isPhoneVerified: boolean;
    createdAt: Date;
  };
};

/**
 * Public read model for property details (§20). Owner email/phone are
 * structurally absent — the owner select simply never includes them.
 */
@Injectable()
export class PublicPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  private findBySlugOrId(slugOrId: string): Promise<DetailRow | null> {
    const where = UUID_RE.test(slugOrId) ? { id: slugOrId } : { slug: slugOrId };
    return this.prisma.properties.findUnique({
      where,
      include: {
        images: { orderBy: { ordering: 'asc' } },
        region: true,
        owner: { select: { id: true, name: true, avatar: true, isPhoneVerified: true, createdAt: true } },
      },
    }) as Promise<DetailRow | null>;
  }

  async details(
    slugOrId: string,
    record: { userId: string | null; sessionId: string } | null,
    recordView: (propertyId: string, ownerId: string) => Promise<void>,
  ): Promise<PublicPropertyDetailDTOT> {
    const prop = await this.findBySlugOrId(slugOrId);
    if (!prop || prop.status !== 'ACTIVE') throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND' });
    if (record) await recordView(prop.id, prop.ownerId);
    const similar = await this.similarRows(prop);
    return this.toPublicDetail(prop, similar);
  }

  async similarFor(slugOrId: string): Promise<PropertyCardDTOT[]> {
    const prop = await this.findBySlugOrId(slugOrId);
    if (!prop || prop.status !== 'ACTIVE') throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND' });
    return this.similarRows(prop);
  }

  private async similarRows(prop: DetailRow): Promise<PropertyCardDTOT[]> {
    if (!prop.regionId) return [];
    const rows = await this.prisma.properties.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: prop.id },
        regionId: prop.regionId,
        type: prop.type,
      },
      orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      include: { images: { take: 1, orderBy: { ordering: 'asc' } }, region: true },
    });
    return rows.map((row) => toCardDTO(row as CardRow));
  }

  private toPublicDetail(prop: DetailRow, similar: PropertyCardDTOT[]): PublicPropertyDetailDTOT {
    const base = publicStorageBaseUrl();
    const abs = (url: string | null): string | null =>
      url ? (url.startsWith('http') ? url : `${base}/${url}`) : null;
    return {
      id: prop.id,
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
      isVerified: prop.isVerified,
      views: prop.views,
      mainImageUrl: abs(prop.mainImageUrl),
      images: prop.images.map((img) => ({
        id: img.id,
        url: abs(img.url) ?? '',
        thumbUrl: abs(img.thumbUrl),
        width: img.width,
        height: img.height,
        ordering: img.ordering,
      })),
      ownerCard: {
        name: prop.owner.name,
        avatar: prop.owner.avatar,
        memberSince: prop.owner.createdAt,
        isPhoneVerified: prop.owner.isPhoneVerified,
      },
      similar,
      createdAt: prop.createdAt,
    };
  }
}

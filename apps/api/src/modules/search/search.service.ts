import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildPaginationMeta,
  type CityDTOT,
  type MapInputT,
  type MapMarkerDTOT,
  type MapResponseT,
  type PropertyCardDTOT,
  type SearchInputT,
} from '@rentuz/contracts';
import { toCardDTO, type CardRow } from '../properties/property-card.mapper.js';
import { SearchCacheService } from './search-cache.service.js';
import { SearchRepository } from './search.repository.js';

const CARD_INCLUDE = {
  images: { take: 1, orderBy: { ordering: 'asc' as const } },
  region: true,
} as const;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SearchRepository,
    private readonly cache: SearchCacheService,
  ) {}

  async search(input: SearchInputT): Promise<{ data: PropertyCardDTOT[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    return this.cache.wrap('list', input, 60, async () => {
      const { ids, total } = await this.repo.searchIds(input);
      return {
        data: await this.hydrateCards(ids),
        meta: buildPaginationMeta(input.page, input.limit, total),
      };
    });
  }

  async map(input: MapInputT): Promise<MapResponseT> {
    return this.cache.wrap('map', input, 60, async () => {
      const { ids, truncated } = await this.repo.findMapIds(input);
      if (ids.length === 0) return { markers: [], truncated };
      const rows = await this.prisma.properties.findMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        select: {
          id: true,
          slug: true,
          title: true,
          price: true,
          priceUzs: true,
          currency: true,
          lat: true,
          lng: true,
          type: true,
          mainImageUrl: true,
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const markers: MapMarkerDTOT[] = [];
      for (const id of ids) {
        const r = byId.get(id);
        if (!r || r.lat === null || r.lng === null) continue;
        markers.push({
          id: r.id,
          slug: r.slug,
          title: r.title,
          price: Number(r.price),
          priceUzs: Number(r.priceUzs),
          currency: r.currency,
          lat: r.lat,
          lng: r.lng,
          type: r.type,
          mainImage: r.mainImageUrl,
        });
      }
      return { markers, truncated };
    });
  }

  async cities(): Promise<CityDTOT[]> {
    return this.cache.wrap('cities', null, 3600, async () => {
      const grouped = await this.prisma.properties.groupBy({
        by: ['regionId'],
        where: { status: 'ACTIVE', regionId: { not: null } },
        _count: { _all: true },
      });
      if (grouped.length === 0) return [];
      const regions = await this.prisma.locations.findMany({
        where: { id: { in: grouped.map((g) => g.regionId).filter((id): id is string => id !== null) } },
      });
      const byId = new Map(regions.map((r) => [r.id, r]));
      return grouped
        .map((g) => {
          const region = g.regionId ? byId.get(g.regionId) : undefined;
          return region ? { id: region.id, name: region.name, slug: region.slug, count: g._count._all } : null;
        })
        .filter((c): c is CityDTOT => c !== null)
        .sort((a, b) => b.count - a.count);
    });
  }

  async featured(): Promise<PropertyCardDTOT[]> {
    return this.cache.wrap('featured', null, 300, async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const top = await this.prisma.propertyViews.groupBy({
        by: ['propertyId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { propertyId: 'desc' } },
        take: 12,
      });
      const cards = await this.hydrateActive(top.map((t) => t.propertyId));
      if (cards.length < 12) {
        // Fresh installs have no view rows yet — top up by lifetime views.
        const extra = await this.prisma.properties.findMany({
          where: { status: 'ACTIVE', id: { notIn: cards.map((c) => c.id) } },
          orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
          take: 12 - cards.length,
          include: CARD_INCLUDE,
        });
        cards.push(...extra.map((row) => toCardDTO(row as CardRow)));
      }
      return cards.slice(0, 12);
    });
  }

  private async hydrateCards(ids: string[]): Promise<PropertyCardDTOT[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.properties.findMany({
      where: { id: { in: ids } },
      include: CARD_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r as CardRow]));
    // Re-sort application-side: the SQL order is only a planner hint (§5).
    return ids.map((id) => byId.get(id)).filter((r): r is CardRow => r !== undefined).map(toCardDTO);
  }

  private async hydrateActive(ids: string[]): Promise<PropertyCardDTOT[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.properties.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      include: CARD_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r as CardRow]));
    return ids.map((id) => byId.get(id)).filter((r): r is CardRow => r !== undefined).map(toCardDTO);
  }
}

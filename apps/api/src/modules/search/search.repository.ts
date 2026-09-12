import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MapInputT, SearchInputT } from '@rentuz/contracts';

export interface SearchIdsResult {
  ids: string[];
  total: number;
}

export interface MapIdsResult {
  ids: string[];
  truncated: boolean;
}

export interface SearchFilters {
  city?: string;
  district?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  minArea?: number;
  maxArea?: number;
  minFloor?: number;
  furnished?: string;
  pets?: boolean;
  smoking?: boolean;
  verified?: boolean;
  lat?: number;
  lng?: number;
  radius?: number;
}

/**
 * The only raw-SQL search surface (0_Phase.md §1 trap 3 allows geo + search
 * repositories). Every value is parameterized; camelCase column names match
 * Prisma's quoting; PostGIS calls need the extensions search_path re-set
 * because pooled connections do not inherit it (Phase 2 trap).
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async setSearchPath(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`SET search_path TO public, extensions;`);
  }

  private filters(f: SearchFilters): Prisma.Sql {
    // Boolean flags: filter only when TRUE — FALSE means "unchecked in the UI".
    return Prisma.sql`
      p.status = 'ACTIVE'
      AND (${f.city ?? null}::uuid IS NULL OR p."regionId" = ${f.city ?? null}::uuid)
      AND (${f.district ?? null}::uuid IS NULL OR p."districtId" = ${f.district ?? null}::uuid)
      AND (${f.type ?? null}::"PropertyType" IS NULL OR p.type = ${f.type ?? null}::"PropertyType")
      AND (${f.rooms ?? null}::int IS NULL OR p.rooms >= ${f.rooms ?? null}::int)
      AND (${f.bedrooms ?? null}::int IS NULL OR p.bedrooms >= ${f.bedrooms ?? null}::int)
      AND (${f.bathrooms ?? null}::int IS NULL OR p.bathrooms >= ${f.bathrooms ?? null}::int)
      AND (${f.minPrice ?? null}::bigint IS NULL OR p."priceUzs" >= ${f.minPrice ?? null}::bigint)
      AND (${f.maxPrice ?? null}::bigint IS NULL OR p."priceUzs" <= ${f.maxPrice ?? null}::bigint)
      AND (${f.minArea ?? null}::numeric IS NULL OR p.area >= ${f.minArea ?? null}::numeric)
      AND (${f.maxArea ?? null}::numeric IS NULL OR p.area <= ${f.maxArea ?? null}::numeric)
      AND (${f.minFloor ?? null}::int IS NULL OR p."floor" >= ${f.minFloor ?? null}::int)
      AND (${f.furnished ?? null}::"FurnishedLevel" IS NULL OR p.furnished = ${f.furnished ?? null}::"FurnishedLevel")
      AND (${f.pets ?? null}::boolean IS NOT TRUE OR p."petsAllowed" = TRUE)
      AND (${f.smoking ?? null}::boolean IS NOT TRUE OR p."smokingAllowed" = TRUE)
      AND (${f.verified ?? null}::boolean IS NOT TRUE OR p."isVerified" = TRUE)
      AND (
        ${f.lat ?? null}::double precision IS NULL
        OR ${f.lng ?? null}::double precision IS NULL
        OR ${f.radius ?? null}::int IS NULL
        OR ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(${f.lng ?? null}, ${f.lat ?? null}), 4326)::geography,
          ${f.radius ?? null}::int
        )
      )
    `;
  }

  private order(sort: string): Prisma.Sql {
    // The partial CASE keys are planner hints only — the app layer re-sorts
    // hydrated rows by the original id order (3_Phase.md §5 "sort drift").
    return Prisma.sql`
      CASE WHEN ${sort}::text = 'price_asc' THEN p."priceUzs" END ASC,
      CASE WHEN ${sort}::text = 'price_desc' THEN p."priceUzs" END DESC,
      CASE WHEN ${sort}::text = 'popular' THEN p.views END DESC,
      p."createdAt" DESC
    `;
  }

  async searchIds(input: SearchInputT): Promise<SearchIdsResult> {
    await this.setSearchPath();
    const offset = (input.page - 1) * input.limit;
    const rows = await this.prisma.$queryRaw<{ id: string; total: number }[]>`
      SELECT p.id, (count(*) OVER ())::int AS total
      FROM "properties" p
      WHERE ${this.filters(input)}
      ORDER BY ${this.order(input.sort)}
      LIMIT ${input.limit}::int OFFSET ${offset}::int
    `;
    if (rows.length === 0 && offset > 0) {
      // Window counts die on empty pages — fall back to a count-only query so
      // pagination UI still knows the real total.
      const countRows = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT count(*)::int AS c FROM "properties" p WHERE ${this.filters(input)}
      `;
      return { ids: [], total: countRows[0]?.c ?? 0 };
    }
    return { ids: rows.map((r) => r.id), total: rows[0]?.total ?? 0 };
  }

  async findMapIds(input: MapInputT): Promise<MapIdsResult> {
    await this.setSearchPath();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM "properties" p
      WHERE p.status = 'ACTIVE'
        AND p.location IS NOT NULL
        AND p.location && ST_MakeEnvelope(${input.swLng}, ${input.swLat}, ${input.neLng}, ${input.neLat}, 4326)::geography
        AND (${input.type ?? null}::"PropertyType" IS NULL OR p.type = ${input.type ?? null}::"PropertyType")
        AND (${input.minPrice ?? null}::bigint IS NULL OR p."priceUzs" >= ${input.minPrice ?? null}::bigint)
        AND (${input.maxPrice ?? null}::bigint IS NULL OR p."priceUzs" <= ${input.maxPrice ?? null}::bigint)
        AND (${input.verified ?? null}::boolean IS NOT TRUE OR p."isVerified" = TRUE)
      LIMIT 501
    `;
    const truncated = rows.length > 500;
    return { ids: rows.slice(0, 500).map((r) => r.id), truncated };
  }
}

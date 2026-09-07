import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * The only place that writes the PostGIS `location` column (or reads it for
 * geo queries). All raw SQL stays here per 0_Phase.md §1 trap 3.
 *
 * Pooled/runtime connections do NOT inherit the URL's `search_path` (same
 * trap that bit migrations in Phase 1). Prisma 7's driver adapter ignores
 * `$transaction({ timeout })` for raw SQL batches, so we set the search_path
 * on every fresh connection via `OnModuleInit` (best-effort) AND defensively
 * re-set it before each geo statement (a cheap round-trip on the already-
 * open connection).
 */
@Injectable()
export class GeoRepository implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`SET search_path TO public, extensions;`).catch(() => undefined);
  }

  private async setSearchPath(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`SET search_path TO public, extensions;`);
  }

  async setLocation(propertyId: string, lng: number, lat: number): Promise<void> {
    await this.setSearchPath();
    await this.prisma.$executeRaw`
      UPDATE "properties"
      SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          "lat" = ${lat}, "lng" = ${lng}
      WHERE "id" = ${propertyId}::uuid
    `;
  }

  async findInRadius(lng: number, lat: number, meters: number, limit = 100): Promise<string[]> {
    await this.setSearchPath();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "properties"
      WHERE status = 'ACTIVE' AND "location" IS NOT NULL
        AND ST_DWithin("location", ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${meters})
      ORDER BY ST_Distance("location", ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }

  async findInBounds(swLng: number, swLat: number, neLng: number, neLat: number, limit = 500): Promise<string[]> {
    await this.setSearchPath();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "properties"
      WHERE status = 'ACTIVE' AND "location" IS NOT NULL
        AND "location" && ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326)::geography
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }
}

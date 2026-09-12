import { Injectable } from '@nestjs/common';
import { tashkentMidnightUtc } from '@rentuz/contracts';
import type {
  AdminAnalyticsQueryT,
  AdminAnalyticsResponseT,
  AdminRequestRowDTOT,
  AdminRequestsListQueryT,
} from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { cursorMeta, parseCursor } from '../../common/utils/cursor.js';

/**
 * §57 platform-wide admin analytics. KPIs are live counters (cheap at MVP
 * volume); the growth series is day-bucketed in Asia/Tashkent using the same
 * epoch math as analytics.service.ts (6_Phase.md §1.2.4). Revenue is 0 —
 * payments ship in Phase 2 of the product.
 */
const DAY_MS = 86_400_000;

/** YYYY-MM-DD label of a Tashkent-midnight epoch. */
function isoTashkentDay(ms: number): string {
  return new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10);
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(query: AdminAnalyticsQueryT): Promise<AdminAnalyticsResponseT> {
    const days = query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30;
    const nowMs = Date.now();
    const todayStart = tashkentMidnightUtc(nowMs);
    const startMs = todayStart - (days - 1) * DAY_MS;
    const endMs = todayStart + DAY_MS;
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();

    const [
      totalUsers,
      activeUsers,
      totalProperties,
      activeProperties,
      pendingVerification,
      openReports,
      rentalRequestsInRange,
      growthRows,
    ] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.users.count({ where: { status: 'ACTIVE' } }),
      this.prisma.properties.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.properties.count({ where: { status: 'ACTIVE' } }),
      this.prisma.properties.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.prisma.reports.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
      this.prisma.rentalRequests.count({ where: { createdAt: { gte: new Date(startIso), lt: new Date(endIso) } } }),
      this.prisma.$queryRaw<Array<{ day: string; newUsers: number; newProperties: number; requests: number }>>`
        WITH days AS (
          SELECT ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, 1 AS kind FROM "users"
          WHERE "createdAt" >= ${startIso}::timestamptz AND "createdAt" < ${endIso}::timestamptz
          UNION ALL
          SELECT ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date, 2 FROM "properties"
          WHERE "createdAt" >= ${startIso}::timestamptz AND "createdAt" < ${endIso}::timestamptz
          UNION ALL
          SELECT ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date, 3 FROM "rentalRequests"
          WHERE "createdAt" >= ${startIso}::timestamptz AND "createdAt" < ${endIso}::timestamptz
        )
        SELECT to_char(day, 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE kind = 1)::int AS "newUsers",
               count(*) FILTER (WHERE kind = 2)::int AS "newProperties",
               count(*) FILTER (WHERE kind = 3)::int AS requests
        FROM days GROUP BY day ORDER BY day`,
    ]);

    // Zero-fill every calendar day so the chart never skips gaps.
    const byDay = new Map(growthRows.map((r) => [r.day, r]));
    const series = [];
    for (let t = startMs; t < endMs; t += DAY_MS) {
      const label = isoTashkentDay(t);
      const row = byDay.get(label);
      series.push({
        date: label,
        newUsers: row?.newUsers ?? 0,
        newProperties: row?.newProperties ?? 0,
        requests: row?.requests ?? 0,
      });
    }

    return {
      kpis: {
        totalUsers,
        activeUsers,
        totalProperties,
        activeProperties,
        pendingVerification,
        openReports,
        rentalRequestsInRange,
        revenue: 0,
      },
      series,
    };
  }

  /** §15 /admin/requests — read-only view over all rental requests. */
  async requests(
    query: AdminRequestsListQueryT,
  ): Promise<{ data: AdminRequestRowDTOT[]; meta: ReturnType<typeof cursorMeta> }> {
    const { before } = parseCursor(query.cursor);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00+05:00`) } : {}),
              ...(query.to ? { lt: new Date(`${query.to}T00:00:00+05:00`) } : {}),
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
    };

    const rows = await this.prisma.rentalRequests.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        property: { select: { id: true, title: true, slug: true } },
        tenant: { select: { id: true, name: true, phone: true } },
        owner: { select: { id: true, name: true, phone: true } },
      },
    });

    const meta = cursorMeta(rows, query.limit);
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        property: row.property,
        tenant: row.tenant,
        owner: row.owner,
        message: row.message,
        startDate: row.startDate,
        durationMonths: row.durationMonths,
        status: row.status,
        priceUzsSnapshot: Number(row.priceUzsSnapshot),
        decidedAt: row.decidedAt,
        createdAt: row.createdAt,
      })),
      meta,
    };
  }
}

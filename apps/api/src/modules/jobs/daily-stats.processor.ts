import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * §1.2.6 — 02:00 Asia/Tashkent daily rollup. Recomputes propertyDailyStats
 * for the last 30 days (Tashkent calendar) for every property touched in
 * that window; idempotent via the (propertyId, day) upsert, so a re-run or
 * crash-retry lands the same numbers.
 *
 * Also (§3 hand-off from 3_Phase.md §3): rebuilds the denormalized
 * properties.views counter from the propertyViews journal after the rollup.
 *
 * Counter semantics: views/favorites/requests/messages count events CREATED
 * on that day; `accepted` counts requests DECIDED (accepted) on that day.
 * `conversion` is always computed live in AnalyticsService.
 */
@Processor('daily-stats', { concurrency: 1 })
export class DailyStatsProcessor extends WorkerHost {
  private readonly logger = new Logger(DailyStatsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<{ rows: number; viewsRebuilt: number }> {
    const rolled = await this.prisma.$executeRaw`
      WITH touched AS (
        SELECT DISTINCT "propertyId" FROM "propertyViews" WHERE "createdAt" >= now() - interval '30 days'
        UNION SELECT "propertyId" FROM "favorites" WHERE "createdAt" >= now() - interval '30 days'
        UNION SELECT "propertyId" FROM "rentalRequests" WHERE "createdAt" >= now() - interval '30 days'
        UNION SELECT "propertyId" FROM "rentalRequests" WHERE "decidedAt" >= now() - interval '30 days'
        UNION SELECT c."propertyId" FROM "messages" m
          JOIN "conversations" c ON c.id = m."conversationId"
          WHERE m."createdAt" >= now() - interval '30 days' AND c."propertyId" IS NOT NULL
      ),
      days AS (
        SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date - generate_series(0, 29))::date AS day
      ),
      grid AS (
        SELECT t."propertyId", d.day FROM touched t CROSS JOIN days d
      ),
      v AS (
        SELECT "propertyId", ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "propertyViews" WHERE "createdAt" >= now() - interval '30 days' GROUP BY 1, 2
      ),
      f AS (
        SELECT "propertyId", ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "favorites" WHERE "createdAt" >= now() - interval '30 days' GROUP BY 1, 2
      ),
      m AS (
        SELECT c."propertyId", (msg."createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "messages" msg JOIN "conversations" c ON c.id = msg."conversationId"
        WHERE msg."createdAt" >= now() - interval '30 days' AND c."propertyId" IS NOT NULL GROUP BY 1, 2
      ),
      r AS (
        SELECT "propertyId", ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "rentalRequests" WHERE "createdAt" >= now() - interval '30 days' GROUP BY 1, 2
      ),
      a AS (
        SELECT "propertyId", ("decidedAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "rentalRequests"
        WHERE status = 'ACCEPTED' AND "decidedAt" >= now() - interval '30 days' GROUP BY 1, 2
      )
      INSERT INTO "propertyDailyStats" AS s (id, "propertyId", day, views, favorites, messages, requests, accepted)
      SELECT gen_random_uuid(), g."propertyId", g.day,
             coalesce(v.n, 0), coalesce(f.n, 0), coalesce(m.n, 0), coalesce(r.n, 0), coalesce(a.n, 0)
      FROM grid g
      LEFT JOIN v ON v."propertyId" = g."propertyId" AND v.day = g.day
      LEFT JOIN f ON f."propertyId" = g."propertyId" AND f.day = g.day
      LEFT JOIN m ON m."propertyId" = g."propertyId" AND m.day = g.day
      LEFT JOIN r ON r."propertyId" = g."propertyId" AND r.day = g.day
      LEFT JOIN a ON a."propertyId" = g."propertyId" AND a.day = g.day
      ON CONFLICT ("propertyId", day) DO UPDATE SET
        views = EXCLUDED.views, favorites = EXCLUDED.favorites,
        messages = EXCLUDED.messages, requests = EXCLUDED.requests,
        accepted = EXCLUDED.accepted`;

    // 3_Phase.md §3: replace the live counter with the nightly journal rebuild.
    const rebuilt = await this.prisma.$executeRaw`
      UPDATE "properties" p
      SET views = sub.n
      FROM (SELECT "propertyId", count(*)::int AS n FROM "propertyViews" GROUP BY 1) sub
      WHERE p.id = sub."propertyId"
        AND p.views <> sub.n`;
    await this.prisma.$executeRaw`
      UPDATE "properties" SET views = 0 WHERE views <> 0 AND id NOT IN (SELECT DISTINCT "propertyId" FROM "propertyViews")`;

    this.logger.log(`daily-stats rollup: ${rolled} property-day rows, ${rebuilt} view counters rebuilt`);
    return { rows: rolled, viewsRebuilt: rebuilt };
  }
}

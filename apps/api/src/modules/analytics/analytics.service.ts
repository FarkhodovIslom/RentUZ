import { BadRequestException, Injectable } from '@nestjs/common';
import {
  tashkentDayNumber,
  type AnalyticsGranularityT,
  type AnalyticsQueryT,
  type AnalyticsSeriesPointT,
  type OwnerAnalyticsResponseT,
  type OwnerOverviewDTOT,
  type OwnerTopPropertyDTOT,
} from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * §34/§50 owner analytics. Day-aligned ranges (7d/30d/90d) read the
 * propertyDailyStats rollup the nightly job maintains; `custom` (and the
 * conversion ratio, which needs decision history) runs live aggregation.
 * All "days" are Asia/Tashkent calendar days (UTC+5; contracts/tz.ts is the
 * single source of the boundary math).
 */

const DAY_MS = 86_400_000;
const MAX_CUSTOM_DAYS = 365;

export interface ResolvedRange {
  /** Inclusive first day, exclusive last day, as UTC epochs aligned to Tashkent midnights. */
  startMs: number;
  endMs: number;
  days: number;
  fromRollup: boolean;
  granularity: AnalyticsGranularityT;
}

export function resolveAnalyticsRange(query: AnalyticsQueryT, nowMs: number): ResolvedRange {
  const todayStart = tashkentMidnightMs(nowMs);
  let startMs: number;
  let endMs: number;
  let days: number;
  let fromRollup: boolean;

  const preset = { '7d': 7, '30d': 30, '90d': 90 } as const;
  if (query.range !== 'custom') {
    days = preset[query.range as keyof typeof preset];
    startMs = todayStart - (days - 1) * DAY_MS;
    endMs = todayStart + DAY_MS;
    fromRollup = true;
  } else {
    const from = parseUtcDay(query.from as string);
    const to = query.to ? parseUtcDay(query.to) : todayStart;
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'range sanalarini tekshiring' });
    }
    const toCapped = Math.min(to, todayStart); // never expose beyond today
    const toEnd = toCapped + DAY_MS;
    startMs = Math.max(from, toEnd - MAX_CUSTOM_DAYS * DAY_MS); // 365 d clamp
    endMs = toEnd;
    days = Math.max(Math.round((endMs - startMs) / DAY_MS), 1);
    fromRollup = false;
  }
  return {
    startMs,
    endMs,
    days,
    fromRollup,
    granularity: days <= 90 ? 'day' : 'week',
  };
}

/** UTC epoch of 00:00 Asia/Tashkent today. */
function tashkentMidnightMs(nowMs: number): number {
  return tashkentDayNumber(nowMs) * DAY_MS - 5 * 3_600_000;
}

/**
 * Tashkent calendar date (YYYY-MM-DD) of a Tashkent-midnight epoch. Feeding
 * ISO timestamps straight into a `::date` cast silently floors them to the
 * UTC date (19:00Z of the day before) — this keeps the rollup upper bound
 * from dropping "today" (§5 test found the off-by-one).
 */
function isoTashkentDay(ms: number): string {
  return new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10);
}

function parseUtcDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00+05:00`); // date-picked-in-Tashkent → UTC epoch
}

interface DayRow {
  day: number;
  views: number;
  favorites: number;
  messages: number;
  requests: number;
  accepted: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async ownerAnalytics(ownerId: string, query: AnalyticsQueryT): Promise<OwnerAnalyticsResponseT> {
    const nowMs = Date.now();
    const range = resolveAnalyticsRange(query, nowMs);

    const dayRows = range.fromRollup
      ? await this.rollupDays(ownerId, range)
      : await this.liveDays(ownerId, range);
    const series = range.granularity === 'day' ? toDayPoints(dayRows) : toWeekPoints(dayRows, range);

    const overview: OwnerOverviewDTOT = {
      views: sum(dayRows, 'views'),
      favorites: sum(dayRows, 'favorites'),
      messages: sum(dayRows, 'messages'),
      requests: sum(dayRows, 'requests'),
      conversion: await this.conversion(ownerId, range),
    };
    const topProperties = await this.topProperties(ownerId, range, 5);
    return { overview, granularity: range.granularity, series, topProperties };
  }

  /** Day-aligned presets come straight from the nightly rollup. */
  private async rollupDays(ownerId: string, range: ResolvedRange): Promise<DayRow[]> {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT extract(epoch from s.day)::bigint * 1000 AS "day",
             coalesce(sum(s.views), 0)::int AS views,
             coalesce(sum(s.favorites), 0)::int AS favorites,
             coalesce(sum(s.messages), 0)::int AS messages,
             coalesce(sum(s.requests), 0)::int AS requests,
             coalesce(sum(s.accepted), 0)::int AS accepted
      FROM "propertyDailyStats" s
      JOIN "properties" p ON p.id = s."propertyId"
      WHERE p."ownerId" = ${ownerId}::uuid
        AND s.day >= ${isoTashkentDay(range.startMs)}::date
        AND s.day <= ${isoTashkentDay(range.endMs - DAY_MS)}::date
      GROUP BY 1 ORDER BY 1`;
    return this.fillDays(rows.map(toDayRow), range);
  }

  /** Custom ranges aggregate live off the event tables (Tashkent-day bucketed). */
  private async liveDays(ownerId: string, range: ResolvedRange): Promise<DayRow[]> {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      WITH props AS (SELECT id FROM "properties" WHERE "ownerId" = ${ownerId}::uuid),
      v AS (
        SELECT ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "propertyViews" WHERE "propertyId" IN (SELECT id FROM props)
          AND "createdAt" >= ${new Date(range.startMs).toISOString()}::timestamptz
          AND "createdAt" < ${new Date(range.endMs).toISOString()}::timestamptz
        GROUP BY 1),
      f AS (
        SELECT ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "favorites" WHERE "propertyId" IN (SELECT id FROM props)
          AND "createdAt" >= ${new Date(range.startMs).toISOString()}::timestamptz
          AND "createdAt" < ${new Date(range.endMs).toISOString()}::timestamptz
        GROUP BY 1),
      m AS (
        SELECT (msg."createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "messages" msg JOIN "conversations" c ON c.id = msg."conversationId"
        WHERE c."propertyId" IN (SELECT id FROM props)
          AND msg."createdAt" >= ${new Date(range.startMs).toISOString()}::timestamptz
          AND msg."createdAt" < ${new Date(range.endMs).toISOString()}::timestamptz
        GROUP BY 1),
      r AS (
        SELECT ("createdAt" AT TIME ZONE 'Asia/Tashkent')::date AS day,
               count(*)::int AS total
        FROM "rentalRequests" WHERE "propertyId" IN (SELECT id FROM props)
          AND "createdAt" >= ${new Date(range.startMs).toISOString()}::timestamptz
          AND "createdAt" < ${new Date(range.endMs).toISOString()}::timestamptz
        GROUP BY 1),
      a AS (
        SELECT ("decidedAt" AT TIME ZONE 'Asia/Tashkent')::date AS day, count(*)::int AS n
        FROM "rentalRequests" WHERE "propertyId" IN (SELECT id FROM props)
          AND status = 'ACCEPTED' AND "decidedAt" IS NOT NULL
          AND "decidedAt" >= ${new Date(range.startMs).toISOString()}::timestamptz
          AND "decidedAt" < ${new Date(range.endMs).toISOString()}::timestamptz
        GROUP BY 1),
      days AS (
        SELECT day FROM v UNION SELECT day FROM f UNION SELECT day FROM m UNION SELECT day FROM r UNION SELECT day FROM a
      )
      SELECT extract(epoch from d.day)::bigint * 1000 AS "day",
             coalesce(v.n, 0) AS views, coalesce(f.n, 0) AS favorites,
             coalesce(m.n, 0) AS messages, coalesce(r.total, 0) AS requests, coalesce(a.n, 0) AS accepted
      FROM days d
      LEFT JOIN v ON v.day = d.day LEFT JOIN f ON f.day = d.day
      LEFT JOIN m ON m.day = d.day LEFT JOIN r ON r.day = d.day LEFT JOIN a ON a.day = d.day
      ORDER BY 1`;
    return this.fillDays(rows.map(toDayRow), range);
  }

  /**
   * Conversion (§50): accepted / (accepted + rejected + cancelled + expired)
   * over requests *decided* in range. Always live — the rollup keeps
   * creation-day counters, decision-day semantics differ.
   */
  private async conversion(ownerId: string, range: ResolvedRange): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ status: string; n: number }>>`
      SELECT rr.status::text AS status, count(*)::int AS n
      FROM "rentalRequests" rr JOIN "properties" p ON p.id = rr."propertyId"
      WHERE p."ownerId" = ${ownerId}::uuid
        AND rr."decidedAt" >= ${new Date(range.startMs).toISOString()}::timestamptz
        AND rr."decidedAt" < ${new Date(range.endMs).toISOString()}::timestamptz
        AND rr.status IN ('ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')
      GROUP BY 1`;
    let accepted = 0;
    let decided = 0;
    for (const row of rows) {
      decided += row.n;
      if (row.status === 'ACCEPTED') accepted += row.n;
    }
    return decided === 0 ? 0 : Number((accepted / decided).toFixed(4));
  }

  private async topProperties(
    ownerId: string,
    range: ResolvedRange,
    limit: number,
  ): Promise<OwnerTopPropertyDTOT[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ propertyId: string; title: string; slug: string; mainImageUrl: string | null; views: number; favorites: number }>
    >`
      SELECT p.id AS "propertyId", p.title, p.slug, p."mainImageUrl",
             coalesce(sum(s.views), 0)::int AS views,
             coalesce(sum(s.favorites), 0)::int AS favorites
      FROM "properties" p
      LEFT JOIN "propertyDailyStats" s
        ON s."propertyId" = p.id
        AND s.day >= ${isoTashkentDay(range.startMs)}::date
        AND s.day <= ${isoTashkentDay(range.endMs - DAY_MS)}::date
      WHERE p."ownerId" = ${ownerId}::uuid AND p.status <> 'DELETED'
      GROUP BY p.id ORDER BY views DESC, p."createdAt" DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({ ...r, views: Number(r.views), favorites: Number(r.favorites) }));
  }

  /** Zero-fill every calendar day in range so charts never skip gaps. */
  private fillDays(rows: DayRow[], range: ResolvedRange): DayRow[] {
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out: DayRow[] = [];
    for (let t = range.startMs; t < range.endMs; t += DAY_MS) {
      out.push(byDay.get(t) ?? { day: t, views: 0, favorites: 0, messages: 0, requests: 0, accepted: 0 });
    }
    return out;
  }
}

function toDayRow(r: Record<string, unknown>): DayRow {
  // SQL returns the calendar date's UTC-midnight epoch; day keys in this file
  // are Tashkent midnights (D-1 19:00 UTC), so shift back by the UTC+5 offset.
  return {
    day: Number(r.day) - 5 * 3_600_000,
    views: Number(r.views),
    favorites: Number(r.favorites),
    messages: Number(r.messages),
    requests: Number(r.requests),
    accepted: Number(r.accepted),
  };
}

function isoDateDay(ms: number): string {
  // day epoch ms == extract(epoch from date)::bigint*1000 with the date cast
  // to UTC midnight — render as plain YYYY-MM-DD.
  return new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10);
}

function toDayPoints(days: DayRow[]): AnalyticsSeriesPointT[] {
  return days.map((d) => ({ date: isoDateDay(d.day), ...pick(d) }));
}

/** Weekly buckets (§34: granularity auto-switches above 90 d). */
function toWeekPoints(days: DayRow[], range: ResolvedRange): AnalyticsSeriesPointT[] {
  const buckets = new Map<number, AnalyticsSeriesPointT & { views: number }>();
  for (const d of days) {
    const idx = Math.floor((d.day - range.startMs) / (7 * DAY_MS));
    const label = range.startMs + idx * 7 * DAY_MS;
    let point = buckets.get(label);
    if (!point) {
      point = { date: isoDateDay(label), views: 0, favorites: 0, messages: 0, requests: 0, accepted: 0 };
      buckets.set(label, point);
    }
    point.views += d.views;
    point.favorites += d.favorites;
    point.messages += d.messages;
    point.requests += d.requests;
    point.accepted += d.accepted;
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

function pick(d: DayRow): Omit<DayRow, 'day'> {
  return { views: d.views, favorites: d.favorites, messages: d.messages, requests: d.requests, accepted: d.accepted };
}

function sum(rows: DayRow[], key: keyof Omit<DayRow, 'day'>): number {
  return rows.reduce((acc, row) => acc + row[key], 0);
}

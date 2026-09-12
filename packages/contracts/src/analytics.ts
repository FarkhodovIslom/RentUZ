import { z } from 'zod';

/**
 * §34/§50 owner analytics contracts. Query dates stay strings (0_Phase.md
 * §1 trap 12: z.coerce.date() crashes Swagger on @Query schemas) — the
 * service converts. Ranges: 7d/30d/90d hit the propertyDailyStats rollup,
 * custom runs live aggregation clamped to 365 days.
 */
export const AnalyticsRange = z.enum(['7d', '30d', '90d', 'custom']);
export type AnalyticsRangeT = z.infer<typeof AnalyticsRange>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const AnalyticsQuery = z
  .object({
    range: AnalyticsRange.default('30d'),
    from: z.string().regex(ISO_DATE, 'YYYY-MM-DD kutilmoqda').optional(),
    to: z.string().regex(ISO_DATE, 'YYYY-MM-DD kutilmoqda').optional(),
  })
  .refine(
    (q) => q.range !== 'custom' || (q.from !== undefined && q.to !== undefined),
    'range=custom uchun from va to talab qilinadi',
  );
export type AnalyticsQueryT = z.infer<typeof AnalyticsQuery>;

export const AnalyticsGranularity = z.enum(['day', 'week']);
export type AnalyticsGranularityT = z.infer<typeof AnalyticsGranularity>;

export const OwnerOverviewDTO = z.object({
  views: z.number().int(),
  favorites: z.number().int(),
  messages: z.number().int(),
  requests: z.number().int(),
  /** accepted / (accepted + rejected + cancelled + expired); 0 when no decisions. */
  conversion: z.number().min(0).max(1),
});
export type OwnerOverviewDTOT = z.infer<typeof OwnerOverviewDTO>;

export const AnalyticsSeriesPoint = z.object({
  /** Tashkent-bucketed day/week start, ISO date. */
  date: z.string(),
  views: z.number().int(),
  favorites: z.number().int(),
  messages: z.number().int(),
  requests: z.number().int(),
  accepted: z.number().int(),
});
export type AnalyticsSeriesPointT = z.infer<typeof AnalyticsSeriesPoint>;

export const OwnerTopPropertyDTO = z.object({
  propertyId: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  mainImageUrl: z.string().nullable(),
  views: z.number().int(),
  favorites: z.number().int(),
});
export type OwnerTopPropertyDTOT = z.infer<typeof OwnerTopPropertyDTO>;

export const OwnerAnalyticsResponse = z.object({
  overview: OwnerOverviewDTO,
  granularity: AnalyticsGranularity,
  series: z.array(AnalyticsSeriesPoint),
  topProperties: z.array(OwnerTopPropertyDTO),
});
export type OwnerAnalyticsResponseT = z.infer<typeof OwnerAnalyticsResponse>;

import { z } from 'zod';
import { tashkentDayBucket } from './tz.js';

/**
 * §29/§46 notification contracts. Wire format mirrors `notifications` rows:
 * i18n keys + `data` payload; the web resolves keys against uz messages.
 */
export const NOTIF_TYPES = [
  'REQUEST_NEW',
  'REQUEST_ACCEPTED',
  'REQUEST_REJECTED',
  'NEW_MESSAGE',
  'PROPERTY_VERIFIED',
  'PROPERTY_REJECTED',
  'PRICE_CHANGED',
] as const;

export const NotifTypeSchema = z.enum(NOTIF_TYPES);
export type NotifTypeT = z.infer<typeof NotifTypeSchema>;

export const NotificationDTO = z.object({
  id: z.string().uuid(),
  type: NotifTypeSchema,
  titleKey: z.string(),
  bodyKey: z.string(),
  data: z.record(z.string(), z.unknown()),
  // Output-only schemas may coerce dates (Swagger never sees these).
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type NotificationDTOT = z.infer<typeof NotificationDTO>;

/** Cursor pagination (§46): opaque cursor = `createdAt|id`, DESC ordering. */
export const NotificationListQuery = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type NotificationListQueryT = z.infer<typeof NotificationListQuery>;

export const CursorPaginationMeta = z.object({
  limit: z.number().int(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type CursorPaginationMetaT = z.infer<typeof CursorPaginationMeta>;

export const NotificationGroups = z.object({
  bugun: z.array(NotificationDTO),
  kecha: z.array(NotificationDTO),
  oldin: z.array(NotificationDTO),
});
export type NotificationGroupsT = z.infer<typeof NotificationGroups>;

export const NotificationListResponse = z.object({
  data: z.array(NotificationDTO),
  groups: NotificationGroups,
  meta: CursorPaginationMeta,
});
export type NotificationListResponseT = z.infer<typeof NotificationListResponse>;

export const UnreadCountResponse = z.object({
  count: z.number().int().min(0),
});
export type UnreadCountResponseT = z.infer<typeof UnreadCountResponse>;

/** POST /notifications/read-all takes no body; PATCH /:id/read no body either.
 *  Batch variant kept for future use. */
export const MarkReadInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
export type MarkReadInputT = z.infer<typeof MarkReadInput>;

/**
 * Group a fetched page into Bugun/Kecha/Oldin sections (single source of the
 * bucketing rule — the API stores the same groups server-side; web may reuse
 * for optimistic local moves). `nowMs` injectable for tests.
 */
export function groupNotificationsByDay<T extends { createdAt: Date | string }>(
  items: T[],
  nowMs: number,
): Record<ReturnType<typeof tashkentDayBucket>, T[]> {
  const groups = { bugun: [] as T[], kecha: [] as T[], oldin: [] as T[] };
  for (const item of items) {
    const at = typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : item.createdAt.getTime();
    groups[tashkentDayBucket(nowMs, at)].push(item);
  }
  return groups;
}

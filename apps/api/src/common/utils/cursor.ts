/**
 * Cursor pagination helper for the admin lists (7_Phase.md §1.3–1.5 — cursor
 * everywhere in admin, the §92 offset default stays on public endpoints).
 * Opaque cursor: `<createdAt ISO>|<id uuid>` over (createdAt DESC, id DESC) —
 * same wire shape as notifications (§46).
 */
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9a-f-]{36})$/i;

export interface CursorPage {
  before: { createdAt: Date; id: string } | null;
}

export function parseCursor(cursor: string | undefined): CursorPage {
  if (!cursor) return { before: null };
  const match = CURSOR_RE.exec(cursor);
  return match ? { before: { createdAt: new Date(match[1]), id: match[2] } } : { before: null };
}

export function buildCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export function cursorMeta<T extends { createdAt: Date; id: string }>(
  page: T[],
  limit: number,
): { limit: number; hasMore: boolean; nextCursor: string | null } {
  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const last = items[items.length - 1];
  return { limit, hasMore, nextCursor: hasMore && last ? buildCursor(last) : null };
}

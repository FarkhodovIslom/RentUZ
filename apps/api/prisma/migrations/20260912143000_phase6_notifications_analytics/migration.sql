-- Phase 6 (6_Phase.md §2): notification read-path + rollup additions.
-- Written by hand (auth_core / phase3 precedent): Prisma cannot express
-- partial or expression indexes, and a `migrate dev` diff would otherwise
-- try to drop the pre-existing raw-SQL indexes.
SET search_path = public, extensions;

-- Navbar poll: unread notifications per user, newest first (partial).
CREATE INDEX "notifications_user_unread_idx" ON "notifications" ("userId", "createdAt" DESC) WHERE "readAt" IS NULL;

-- Idempotent enqueue (6_Phase.md §1.1.1): ON CONFLICT DO NOTHING target for
-- (userId, type, data->>'key'). Rows without a data.key are unconstrained.
CREATE UNIQUE INDEX "notifications_idempotency_key_idx" ON "notifications" ("userId", "type", ((data ->> 'key'))) WHERE "data" ->> 'key' IS NOT NULL;

-- ownerSeries()/conversion need accepted-per-day; rollup upserts this column.
ALTER TABLE "propertyDailyStats" ADD COLUMN "accepted" INTEGER NOT NULL DEFAULT 0;

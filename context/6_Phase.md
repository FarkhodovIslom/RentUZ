# RentUZ MVP — Phase 6: Notifications, Owner Dashboard, Analytics

> Cross-cutting decisions live in `0_Phase.md`. The `notifications` table and the `rental_request.*` events were wired in `1_Phase.md` and `4_Phase.md`; this phase builds the user-facing surface on top. The owner dashboard mocks from `2_Phase.md` are replaced with real data here.

## Goal
A user sees a real-time-ish notification feed (poll-based, see `0_Phase.md` §2) for every meaningful event the platform emits: rental request lifecycle changes, chat messages, verification, and price changes. The owner dashboard shows real KPIs and a working analytics page with charts. Daily stats roll up reliably from the existing `propertyViews` log and other event sources.

## Scope (spec coverage)
§29 (notifications), §31 (owner dashboard), §34 (owner analytics), §46 (notifications API), §50 (analytics API), §70 (background jobs — daily aggregation), §84 (notification architecture). Phase 2 product features (push/email delivery, saved searches) are out of scope; the in-app table is the delivery channel for MVP.

## Out of scope this phase
- Push notifications and email delivery (Phase 2 product; `data` field on `notifications` carries everything needed to send later)
- Saved searches and price alerts (Phase 2 product)
- AI recommendations (Phase 2 product, §82)
- Admin analytics (Phase 7) — schema is shared but endpoints are wired separately

---

## 1. Tasks (ordered, with paths)

### 1.1 Notifications — full module
1. `apps/api/src/modules/notifications/notifications.service.ts` (replace the Phase 4 stub):
   - `enqueue({ userId, type, data, titleKey, bodyKey })` — inserts a row in `notifications`. Idempotent by `(userId, type, data->>'key')` where `data.key` is a domain-unique key (e.g., `request:42:accepted`). On conflict, skip.
   - `unreadCount(userId)` — `count(*)` where `readAt IS NULL`. Cached in Redis 30 s per user.
   - `list({ userId, cursor, limit, groupBy })` — returns the items, plus a precomputed `groups: { bugun, kecha, oldin }` map (Tashkent day boundary). Cursor pagination by `(createdAt DESC, id DESC)`.
   - `markRead(userId, ids)` — `UPDATE notifications SET readAt=now() WHERE userId=$1 AND id IN ($2) AND readAt IS NULL`. Invalidate unread cache.
   - `markAllRead(userId)`. Invalidate unread cache.
2. `apps/api/src/modules/notifications/notifications.controller.ts` (§46):
   - `GET /notifications?cursor=&limit=` — current user's notifications, grouped
   - `GET /notifications/unread-count` — for the navbar poll
   - `PATCH /notifications/:id/read`
   - `POST /notifications/read-all`
3. `apps/api/src/modules/notifications/notification-listeners.ts` — wires every `EventEmitter2` event to `notificationsService.enqueue`:
   - `rental_request.created` → owner: `REQUEST_NEW` (the value ships in the Phase 1 enum already — no migration needed, see §2)
   - `rental_request.accepted` → tenant: `REQUEST_ACCEPTED`
   - `rental_request.rejected` → tenant: `REQUEST_REJECTED`
   - `rental_request.cancelled` → owner
   - `rental_request.completed` → both
   - `message.created` (EventBus, emitted by Phase 5's MessagesService; the Socket.IO gateway separately broadcasts `message:new` to sockets) → other participant: `NEW_MESSAGE`
   - `property.verified` → owner: `PROPERTY_VERIFIED`
   - `property.rejected` → owner: `PROPERTY_REJECTED` (with `data.reason`)
   - `property.price_changed` → favorited-by users: `PRICE_CHANGED` (Phase 6 ships the **trigger**: owner-only `PATCH /properties/:id/price` on published (ACTIVE/PAUSED/RENTED) listings, which recomputes `priceUzs` via FxService and emits the event; fanout is limited to users with a `favorites` row pointing at the property)

### 1.2 Owner dashboard
4. `apps/api/src/modules/analytics/analytics.service.ts`:
   - `ownerOverview(ownerId, range)` — returns `{ views, favorites, messages, requests, conversion }` for the given period (default 30 d). Counters are computed from existing tables: views = `count(propertyViews where propertyId in owner's properties)`, favorites = same against `favorites`, messages = same against `messages` joined via `conversations.propertyId`, requests = same against `rental_requests`. Conversion = `accepted / (accepted + rejected + cancelled + expired)` for requests in range.
   - `ownerSeries(ownerId, range, granularity)` — returns an array of `{ date, views, favorites, messages, requests, accepted }` for the line chart. Granularity auto-picks `day` for ≤90 d, `week` for 91–365 d (the spec's filters 7/30/90/custom are all in the day bucket).
   - `ownerTopProperties(ownerId, range, limit=5)` — top N properties by `views` in range.
5. `apps/api/src/modules/analytics/analytics.controller.ts` (§50):
   - `GET /owner/analytics?range=7d|30d|90d|custom&from=&to=` — overview + series + top
   - All endpoints are owner-scoped (verify `req.user.id === ownerId` if `:ownerId` param is used; here we use `/me` via `CurrentUser`).
6. **Daily rollup** (also lands here so analytics are fast for many owners):
   - `apps/api/src/modules/jobs/daily-stats.processor.ts` — repeatable (daily 02:00 Asia/Tashkent via `repeat.tz`): for each property touched in the last 30 days, recompute `propertyDailyStats` rows for the last 30 days. Source: `propertyViews`, `favorites`, `rentalRequests` (created + accepted-by-decision-day), and a count of `messages` whose `conversation.propertyId = property.id` for that day. The rollup is idempotent (UPSERT on `(propertyId, day)`). `accepted` needs the new `propertyDailyStats.accepted` column (see §2).
   - **Also (from 3_Phase.md §3 hand-off):** rebuilds the denormalized `properties.views` counter from the `propertyViews` journal after the rollup (nightly batched replacement for the live counter).
   - The owner overview queries this rollup when the range is "exact days" (7/30/90) and falls back to live aggregation for custom ranges.
7. **Notifications cleanup**:
   - `apps/api/src/modules/jobs/notifications-cleanup.processor.ts` — repeatable (daily 03:00 Asia/Tashkent): delete `notifications` rows older than `NOTIFICATIONS_READ_RETENTION_DAYS` (default 90) where `readAt IS NOT NULL`, and `NOTIFICATIONS_UNREAD_RETENTION_DAYS` (default 30) where `readAt IS NULL`. Both validated in `apps/api/src/config/env.ts` + `.env.example`.

### 1.3 Web
8. `apps/web/src/app/(tenant)/notifications/page.tsx` — per §29:
   - Sections "Bugun", "Kecha", "Oldin" (Tashkent day boundary computed in the web app from `createdAt` in UTC)
   - Each item: type icon, title (i18n key resolved), body, time, unread indicator (yellow accent on the left)
   - "Hammasini o'qish" button → calls `/notifications/read-all`
9. `apps/web/src/components/notifications/NotificationBell.tsx` — in the navbar (both tenant and owner layouts). Polls `/notifications/unread-count` every 30 s + on window focus. Shows the count as a yellow badge. Click opens a popover with the latest 5; "Barchasini ko'rish" → `/notifications`.
10. `apps/web/src/app/(owner)/owner/page.tsx` (replace Phase 2 mock):
    - KPI cards: views, favorites, messages, requests, conversion — for the last 30 d, with a tiny sparkline of the last 14 d
    - "Recent requests" (latest 5 from `/owner/rental-requests`)
    - "Active properties" (top 3 by views in the last 7 d, with status badge)
    - "Recent messages" (latest 3 conversations with unread indicators)
11. `apps/web/src/app/(owner)/owner/analytics/page.tsx` (§34):
    - Range filter (7/30/90/Custom)
    - KPI strip
    - Line chart of `views` and `requests` (recharts) over the selected range
    - Bar chart of `topProperties` (recharts)
    - "Performance insights" — small text panel driven by simple rules (e.g., "So'nggi 7 kunda ko'rishlar 20% ga oshdi" / "Hech qanday faol ijara so'rovi yo'q"). The rules live in `apps/web/src/lib/analytics-insights.ts` and are not the spec's full ML insights.
12. `apps/web/src/components/owner/KpiCard.tsx`, `Sparkline.tsx`, `RangeFilter.tsx`, `InsightsPanel.tsx`. Charts use `recharts` (pinned `3.10.1` in `0_Phase.md`).
13. `apps/web/src/lib/format.ts` — Uzbek price formatting (3 500 000 so'm), date/time in Asia/Tashkent via `date-fns` + `@date-fns/tz`.
14. `apps/web/src/app/(tenant)/layout.tsx`, `(owner)/layout.tsx` — insert `<NotificationBell />` in the topbar.
15. Wire the Phase 4 owner request flow's success path to optimistically invalidate `['owner','requests']` and `['analytics','overview']` TanStack Query keys.

### 1.4 i18n keys
`notifications.types.*` — one per `NotifType` enum value; the shipped enum has **7** values (`REQUEST_NEW`, `REQUEST_ACCEPTED`, `REQUEST_REJECTED`, `NEW_MESSAGE`, `PROPERTY_VERIFIED`, `PROPERTY_REJECTED`, `PRICE_CHANGED`) so the web catalog has 7, not 9. `notifications.group.{bugun,kecha,oldin}` (the group keys are the literal bucket names used by `contracts/tz.ts`), `notifications.empty`, `notifications.markAllRead`, `notifications.viewAll`, `notifications.bodies.{request,message,property,price}.{…}` (interpolated templates), `owner.dashboard.*` (greetings, KPI labels, section titles), `owner.analytics.*` (range labels, chart legends, insight lines). All keys are Uzbek. A contract test (`apps/api/src/modules/notifications/notification-i18n.contract.test.ts`) reads the web `uz.json` and asserts every enum value + every listener-emitted bodyKey has a key.

### 1.5 API contracts
16. Zod in `packages/contracts` (`notifications.ts`, `analytics.ts`, `tz.ts`). Implemented shape:
    - `NotificationDTO` (`id`, `type` (7-value enum), `titleKey`, `bodyKey`, `data` (`z.record`), `readAt` (nullable, output-coerced), `createdAt`).
    - `NotificationListQuery` (`cursor?`, `limit` 1–100 default 20); `NotificationListResponse = { data, groups: { bugun, kecha, oldin }, meta }` where `meta` is a **cursor** meta (`{ limit, hasMore, nextCursor }`) — not the offset `PaginationMeta` from `0_Phase.md §92`, since notifications are the documented cursor-pagination exception.
    - `AnalyticsRange = ["7d","30d","90d","custom"]`.
    - `AnalyticsQuery = { range (default "30d"), from?, to? }`. **`from`/`to` are `YYYY-MM-DD` strings, not `z.coerce.date()`** — this schema is bound to an `@Query` pipe and `0_Phase.md §1` trap 12 forbids `z.coerce.date()` on input DTOs (crashes Swagger). The service converts.
    - `OwnerAnalyticsResponse = { overview: {views,favorites,messages,requests,conversion}, granularity, series[], topProperties[] }`.
    - Shared Tashkent helpers in `tz.ts`: `tashkentDayNumber`, `tashkentDayBucket(now, at)`, `tashkentMidnightUtc`, `groupNotificationsByDay` — the single `tzUtils.ts` the §5 trap calls for (web imports it from `@rentuz/contracts`).

---

## 2. Database changes
Migration `20260912143000_phase6_notifications_analytics` (hand-written SQL — Prisma can't express partial/expression indexes; the auth_core/phase3 precedent). Deltas vs. this section's original plan:
- **No enum migration.** The §1.1 `REQUEST_NEW` "add" step was already satisfied: Phase 1's `NotifType` enum already contains all 7 values (`ALTER TYPE … ADD VALUE 'REQUEST_NEW'` would even error since it exists). This doc line was stale.
- Partial index `notifications_user_unread_idx ON notifications ("userId", "createdAt" DESC) WHERE "readAt" IS NULL` (navbar poll) — added.
- **New (not in the original plan):** partial unique index `notifications_idempotency_key_idx ON notifications ("userId", type, ((data->>'key'))) WHERE data->>'key' IS NOT NULL` — makes `enqueue` idempotent at the DB level (the `ON CONFLICT … DO NOTHING` target), which the 10k-load DoD and the "buggy emitter" note require. Rows without `data.key` stay unconstrained.
- **New:** `propertyDailyStats.accepted INTEGER NOT NULL DEFAULT 0` — the rollup and `ownerSeries()`/conversion need an accepted-per-day column that Phase 1 didn't create.
- `messages` already carries a `(conversationId, createdAt)` index from Phase 1; Phase 5 adds the `(conversationId, createdAt, id)` cursor index in its own migration.

---

## 3. Tests

Unit:
- `notificationsService.enqueue` idempotency (same key + type + user → 1 row, second call no-op)
- `unreadCount` cache invalidation
- `analyticsService.ownerOverview` math (cross-checked against raw queries)
- Range filter resolution (custom dates clamped to 365 d max)
- Day-bucketing in Tashkent timezone (use a fixed UTC timestamp and assert the bucket name)

Integration (PostGIS + Redis):
- Phase 4 emitted events show up as notification rows
- `message:new` from the gateway enqueues a notification for the recipient only (sender does not get one)
- `markRead` / `markAllRead` clear unread count
- Daily rollup job: 30 days of synthetic `propertyViews` for a property → rollup produces 30 `propertyDailyStats` rows with correct counts
- Idempotency: re-running the rollup on the same data is a no-op
- Notifications cleanup: read >90 d deleted, unread >30 d deleted, others retained
- Price-change fanout: a property with 3 favorited-by users and a price change enqueues 3 notifications, no more
- Suspended user still receives notifications but cannot act on them (UI blocks per Phase 7)

Security:
- User A cannot read user B's notifications → 403
- Anonymous poll `/notifications/unread-count` → 401
- Analytics endpoint is owner-scoped: regular user calling `/owner/analytics` works (they own no properties → zeros), but a tenant calling for another owner's ID is impossible (no such param)

Web E2E (Playwright):
- Tenant receives a request-accepted notification → navbar badge increments → clicking the bell shows it → opening the full page groups it under "Bugun"
- Owner: change property price (Phase 2 wizard) → favoriting tenant sees a "PRICE_CHANGED" notification in their feed
- Owner dashboard: after seeding some activity in the past 30 d, KPIs and chart match direct DB counts (within a ±1 % fuzz)
- Range filter: switching 7d → 30d updates the chart without a full reload

---

## 4. Definition of Done
- All paths in §1 implemented; lint+typecheck+unit+integration+E2E green
- Navbar notification badge updates within 30 s of an event
- Owner analytics charts render in <500 ms with 90 days of data
- Daily rollup completes for the seeded 120 properties in <30 s
- A synthetic load of 10 000 notifications enqueued in 60 s completes without errors (idempotency keys prevent duplicates from a buggy emitter)

## 5. Risks & escape hatches
- **Polling vs push** — the spec says real-time for chat, polling is acceptable for notifications. The 30 s + focus interval balances freshness and battery/CPU.
- **Daily rollup on Supabase free tier** — 120 properties × 30 d = 3 600 rows per run, trivial. At 100k properties this needs partitioning by month; documented in `8_Phase.md` §Scalability.
- **Fanout cost on price changes** — limited to `favorites`, not "all users who viewed". The spec is silent; we picked favorited-by because it's a smaller, more meaningful set.
- **Insight text quality** — these are deterministic rules, not ML. Phase 2 introduces AI insights (§82) as a separate non-blocking enhancement.
- **i18n key drift** — the `notifications.types` keys must match the `NotifType` enum; a contract test asserts every enum value has a corresponding i18n key.
- **Time-zone in "Bugun/Kecha"** — both web and server bucket via the shared `packages/contracts/src/tz.ts` (`tashkentDayBucket`). Uzbekistan is a fixed UTC+5 with no DST, so the helper is pure epoch math. The `tz.test.ts` contract test asserts the boundary both ways: 01:00 Tashkent is "bugun" even though UTC is still the previous day, and 23:30 Tashkent on the current day is "bugun" at 18:30 UTC.

---

## 6. Implementation status — ✅ complete (2026-09-12)

Built on `feature/phase-6-notifications-analytics` (developed in a parallel git worktree off `main` with an isolated docker stack — `docker-compose.phase6.yml`, PostGIS :5435 / Redis :6380 — while Phase 5 was in flight; chat-dependent bits (`message.created`) are wired structurally and activate when Phase 5 merges).

- §1: all modules/paths shipped (notifications module incl. listeners + read endpoints, `PATCH /properties/:id/price` trigger, analytics, both jobs, web bell/page/dashboard/analytics, contracts, i18n).
- §2: one hand-written migration (see deltas above); `prisma migrate deploy` verified.
- §3: unit — API 70 (incl. i18n contract test), contracts 48 (incl. Tashkent bucketing); integration 68/68 on the phase-6 stack; E2E Playwright 11/11 (2 new specs).
- §4 DoD measured: 120-property rollup → 3600 rows in 224 ms (re-run idempotent, `viewsRebuilt=0`); 10k enqueue load (2k distinct keys × 5 replays) deduped to exactly 2000 rows; badge poll 30 s + focus; lint/typecheck/unit/integration/build/E2E green.
- Deviations/notes: owner shell has no Navbar — the bell renders as a right-aligned header row inside `(owner)/owner/layout.tsx`; the dashboard "Recent messages" tile is hidden until Phase 5's `/conversations` exists (404-tolerant query); E2E runs `DISABLE_JOBS`, so the KPI-vs-DB ground-truth check asserts the live (custom-range) path in E2E while the rollup path is covered by integration; the "suspended user receives but can't act" case relies on the existing global `SuspendedGuard` (no dedicated phase-6 spec).
- Infra tweak (also useful for Phase 5): `apps/api/vitest.integration.config.ts` now reads `DATABASE_URL`/`REDIS_URL`/`DATABASE_DIRECT_URL` from `apps/api/.env` (shared local stack as fallback) so parallel worktrees can target isolated DBs.

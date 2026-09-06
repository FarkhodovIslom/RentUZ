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
   - `rental_request.created` → owner: type `REQUEST_ACCEPTED` (the spec named this oddly; the actual type is `REQUEST_RECEIVED` for owners; using a clearer `REQUEST_NEW` enum value would be cleaner — for MVP, we use the spec's type set and add a new `REQUEST_NEW` enum value to the migration; see §2)
   - `rental_request.accepted` → tenant: `REQUEST_ACCEPTED`
   - `rental_request.rejected` → tenant: `REQUEST_REJECTED`
   - `rental_request.cancelled` → owner
   - `rental_request.completed` → both
   - `message:new` (from the gateway) → other participant: `NEW_MESSAGE`
   - `property.verified` → owner: `PROPERTY_VERIFIED`
   - `property.rejected` → owner: `PROPERTY_REJECTED` (with `data.reason`)
   - `property.price_changed` → favorited-by users: `PRICE_CHANGED` (Phase 6 ships the **trigger**; fanout is limited to users with a `favorites` row pointing at the property)

### 1.2 Owner dashboard
4. `apps/api/src/modules/analytics/analytics.service.ts`:
   - `ownerOverview(ownerId, range)` — returns `{ views, favorites, messages, requests, conversion }` for the given period (default 30 d). Counters are computed from existing tables: views = `count(propertyViews where propertyId in owner's properties)`, favorites = same against `favorites`, messages = same against `messages` joined via `conversations.propertyId`, requests = same against `rental_requests`. Conversion = `accepted / (accepted + rejected + cancelled + expired)` for requests in range.
   - `ownerSeries(ownerId, range, granularity)` — returns an array of `{ date, views, favorites, messages, requests, accepted }` for the line chart. Granularity auto-picks `day` for ≤90 d, `week` for 91–365 d (the spec's filters 7/30/90/custom are all in the day bucket).
   - `ownerTopProperties(ownerId, range, limit=5)` — top N properties by `views` in range.
5. `apps/api/src/modules/analytics/analytics.controller.ts` (§50):
   - `GET /owner/analytics?range=7d|30d|90d|custom&from=&to=` — overview + series + top
   - All endpoints are owner-scoped (verify `req.user.id === ownerId` if `:ownerId` param is used; here we use `/me` via `CurrentUser`).
6. **Daily rollup** (also lands here so analytics are fast for many owners):
   - `apps/api/src/modules/jobs/processors/daily-stats.processor.ts` — repeatable (daily 02:00 Asia/Tashkent): for each property touched in the last 30 days, recompute `propertyDailyStats` rows for the last 30 days. Source: `propertyViews`, `favorites`, `rentalRequests`, and a count of `messages` whose `conversation.propertyId = property.id` for that day. The rollup is idempotent (UPSERT on `(propertyId, day)`).
   - The owner overview queries this rollup when the range is "exact days" (7/30/90) and falls back to live aggregation for custom ranges.
7. **Notifications cleanup**:
   - `apps/api/src/modules/jobs/processors/notifications-cleanup.processor.ts` — repeatable (daily 03:00 Asia/Tashkent): delete `notifications` rows older than 90 days where `readAt IS NOT NULL`, and 30 days where `readAt IS NULL`. Configurable via `NOTIFICATIONS_*` env.

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
`notifications.types.*` (one per type, all 9 spec types), `notifications.group.today`, `notifications.group.yesterday`, `notifications.group.earlier`, `notifications.empty`, `notifications.markAllRead`, `owner.dashboard.*` (greetings, KPI labels, section titles), `owner.analytics.*` (range labels, chart legends, insight lines). All keys are Uzbek.

### 1.5 API contracts
16. Zod in `packages/contracts`:
    ```ts
    export const NotificationDTO = z.object({
      id: z.string().uuid(),
      type: z.enum([...NotifType]),
      titleKey: z.string(), bodyKey: z.string(),
      data: z.record(z.unknown()),
      readAt: z.coerce.date().nullable(),
      createdAt: z.coerce.date(),
    });
    export const NotificationListResponse = z.object({
      data: z.array(NotificationDTO),
      groups: z.object({ bugun: z.array(NotificationDTO.shape), kecha: z.array(...), oldin: z.array(...) }),
      meta: PaginationMeta,
    });
    export const AnalyticsRange = z.enum(["7d","30d","90d","custom"]);
    export const AnalyticsQuery = z.object({ range: AnalyticsRange.default("30d"), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
    ```

---

## 2. Database changes
- New migration to add a clearer enum value: `ALTER TYPE notif_type ADD VALUE 'REQUEST_NEW';` (for owner "you received a new request"). Other types are reused from Phase 1.
- `CREATE INDEX notifications_user_unread_idx ON notifications ("userId", "createdAt" DESC) WHERE "readAt" IS NULL;` (partial — supports the navbar poll).
- New `propertyDailyStats` table already in Phase 1; ensure the indexes from Phase 1 are present.

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
- **Time-zone in "Bugun/Kecha"** — both web and server compute in Asia/Tashkent; we have a single `tzUtils.ts` used everywhere. The integration test asserts the bucket for a timestamp at 23:30 Tashkent is "Bugun" even when UTC is the previous day.

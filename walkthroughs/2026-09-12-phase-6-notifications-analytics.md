# Phase 6 — Notifications, Owner Dashboard, Analytics (2026-09-12)

## Task

Implemented `context/6_Phase.md` (§29/§31/§34/§46/§50/§70/§84): the full notifications read surface (idempotent enqueue + Redis-cached unread-count + cursor list with Tashkent-day groups + read endpoints + event listeners), owner analytics API, the nightly rollup/cleanup jobs (plus the `properties.views` nightly rebuild handed off by 3_Phase.md §3), and the web surfaces: notification bell + page, real owner dashboard, analytics page with recharts. Branch `feature/phase-6-notifications-analytics` — **built in a parallel git worktree** (`../RentUZ-phase6`) off `main` while Phase 5 (chat/realtime) was in flight in the primary tree; local commits only, no push/PR.

## Parallel-dev setup

- `git worktree add ../RentUZ-phase6 -b feature/phase-6-notifications-analytics main`.
- Isolated stack: `docker-compose.phase6.yml` (compose project `rentuz-phase6`; PostGIS **:5435**, Redis **:6380**, MinIO :9200/9201, own volumes) so Phase 5's :5434/:6379 stack kept running untouched. API on :4100 (E2E pins its own API to :4000 via webServer env).
- Fresh DB bootstrap: `prisma migrate deploy` + **two-step seed** — the Phase-2 seed rewrite dropped the Phase-1 reference seeding (locations/fx) that `prisma/seed.ts` now assumes; ran the old `c29ccda` seed first, then `db:seed`. (Pre-existing repo gap — see Limitations.)
- `vitest.integration.config.ts` now reads DB/Redis URLs from `apps/api/.env` (fallback: shared stack) instead of hard-coding :5434 — required for worktree isolation; also a general improvement.

## Key findings (docs vs. reality)

- `NotifType` already contained all 7 values since Phase 1 → the planned `ALTER TYPE … 'REQUEST_NEW'` migration was **stale** (dropped).
- `propertyDailyStats` lacked an `accepted` column that `ownerSeries()`/conversion require → added, plus a **partial unique index on `(userId, type, (data->>'key'))`** to make enqueue idempotent at DB level (`ON CONFLICT … DO NOTHING`) — required by the 10k/60 s "buggy emitter" DoD.
- The draft `AnalyticsQuery` used `z.coerce.date()` on `@Query` (violates 0_Phase §1 trap 12) → shipped as `YYYY-MM-DD` strings, converted in service.
- Prisma creates the enum PG type as `"NotifType"` (camelCase); the first raw-SQL cast used `notif_type` → the integration suite caught it immediately.
- `::date` casting of an ISO **timestamp** string silently floors to the UTC date — the rollup upper bound dropped "today" until `isoTashkentDay()` (pure date labels) was used. Caught by the §3 ground-truth test.
- Chat seam: Phase 6 listens to the internal **`message.created`** EventBus event (Phase 5's MessagesService), not the socket `message:new`; payload type kept structural in `event-bus.service.ts` so Phase 6 compiles on `main` (tables already exist).
- `GET /jobs` now lists 6 queues (daily-stats + notifications-cleanup added) → the old hard-coded count in the Phase-4 spec became name-based assertions; its notification asserts now poll (Phase 6 listeners await enrichment lookups before the fire-and-forget insert).

## Files changed

**API** (`apps/api/src/`)
- `modules/notifications/` — `notifications.service.ts` (rewrite: `enqueue` w/ ON CONFLICT + cache bust, `unreadCount` Redis 30 s, keyset-cursor `list` + `groups`, `markRead` (404/403) / `markReadMany` / `markAllRead`), `notifications.controller.ts` (§46 four routes + `POST /notifications/read`), `notification-listeners.ts` (all `rental_request.*`, `message.created`→recipient-only, `property.verified/rejected`, `price_changed`→favorites fan-out; `data.key` idempotency + propertyTitle/actorName enrichment), unit + i18n-contract tests.
- `modules/analytics/` (new) — `analytics.service.ts` (rollup path for 7/30/90 d, live aggregation for custom, conversion always live, auto day/week granularity, 365-d clamp), `analytics.controller.ts` (`GET /owner/analytics`), range-resolver unit tests.
- `modules/jobs/` — `daily-stats.processor.ts` (02:00 TAK; 30-day grid UPSERT incl. `accepted`; **`properties.views` nightly rebuild**), `notifications-cleanup.processor.ts` (03:00 TAK; `NOTIFICATIONS_{READ,UNREAD}_RETENTION_DAYS`), scheduling in `jobs.service.ts` (`repeat.tz`), queues + providers in `jobs.module.ts`, 6-queue `jobs-admin.controller.ts`.
- `common/services/event-bus.service.ts` — typed event→payload map (`BusEventPayloads`), `PROPERTY_EVENTS`/`MESSAGE_EVENTS`; `config/env.ts` + `.env.example` — retention envs; `app.module.ts` — AnalyticsModule.
- `modules/properties/` — `changePrice()` + `PATCH /properties/:id/price` (emits `property.price_changed`), `property.verified` emitted on auto-approve submit; enrichment-safe.
- `prisma/schema.prisma` + `prisma/migrations/20260912143000_phase6_notifications_analytics/` (hand-written SQL).
- `test/notifications-analytics.integration.test.ts` (new, 11 tests: read surface, idempotent replay, recipient-only, cache invalidation, 401/403, cursor pages, 3-fan price fan-out, rollup 30→30 rows + re-run no-op, views rebuild, cleanup windows, analytics ground truth, zeros-not-403, **10k enqueue/60 s load**).

**Contracts** — `notifications.ts`, `analytics.ts`, `tz.ts` (+3 test files, i18n coverage moved to API); `properties.ts` price-change DTOs; barrel exports; test-only files excluded from package build (no node types there).

**Web** (`apps/web/`)
- `components/notifications/` — `NotificationBell.tsx` (30 s + focus poll, popover-5, outside-click dismiss, hidden for 401), `NotificationItem.tsx` (icon/title/interpolated body/unread accent).
- Pages: `(tenant)/notifications/` (Bugun/Kecha/Oldin via shared `groupNotificationsByDay`, cursor "load more", mark-all), `(owner)/owner/analytics/` (`AnalyticsView` with recharts line+bar+`RangeFilter`+`InsightsPanel`), `(owner)/owner/page.tsx` → `DashboardClient` (KPIs+14 d sparkline, recent requests, top-3 by 7 d views, 404-tolerant recent-messages tile).
- `components/owner/` — `KpiCard`, `Sparkline`, `RangeFilter`, `InsightsPanel`; `lib/format.ts` (space-grouped "so'm" via deterministic `formatPriceUzs`, Tashkent date/time via date-fns+`@date-fns/tz` / Intl), `lib/analytics-insights.ts` (deterministic rules); Navbar + owner layout bell; `RequestActions` invalidates `['owner','requests']`+`['analytics','overview']`; `messages/uz.json` notifications/analytics/dashboard namespaces.
- Deps pinned: `recharts@3.10.1`, `date-fns@4.4.0`, `@date-fns/tz@1.2.0`. E2E: `notifications.spec.ts` (badge→popover→Bugun→mark-all; price fan-out + non-fan emptiness), `owner-analytics.spec.ts` (live-path KPIs, insights, client-side range switch).

## Verification (documented order, on the isolated stack)

`pnpm lint` ✓ → `pnpm typecheck` ✓ → `pnpm test` (contracts 48 + api 70 unit) ✓ → `pnpm --filter api test:integration` **68/68** ✓ → `pnpm build` ✓ → `pnpm --filter web test:e2e` **11/11** ✓. DoD: rollup 120 props → 3600 rows in 224 ms, re-run no-op; 10k enqueue → exactly 2k rows deduped.

## Merge plan with Phase 5 (when you're ready)

1. Land Phase 5 first (`main`), then rebase/merge this branch. Expected conflicts (all small, append-style): `notifications.service.ts` (Phase 5's `onModuleInit` `message.created` handler — **delete it**, it moved to `notification-listeners.ts`), `event-bus.service.ts` (keep this branch's typed map; Phase 5's payload shapes fit structurally), `app.module.ts`, `packages/contracts/src/index.ts` + `error-codes.ts`, `apps/api/src/config/env.ts` + `.env.example`, `apps/web/package.json` + `pnpm-lock.yaml` (re-run `pnpm install`), `apps/web/.env.example`, `vitest.integration.config.ts` (both branches fix the same hard-coding), `playwright.config.ts` (webServer env block), `messages/uz.json`, owner layout/sidebar (`messages` `soon` flag flips when chat lands).
2. Post-merge: run both integration suites + add one gateway→`message.created`→NEW_MESSAGE E2E; un-hide the dashboard messages tile by pointing it at Phase 5's `ConversationListQuery`-typed response.

## Limitations

- Phase-1 reference seed lives only in git history (`c29ccda`); fresh `db:seed` on an empty DB fails ("Run pnpm db:seed first") — pre-existing repo gap worth fixing separately.
- E2E boots with `DISABLE_JOBS`, so the bell/dashboard rollup path isn't browser-verified (covered by integration); analytics E2E asserts the live custom-range path.
- "Suspended user receives but can't act" (§3 bullet) rides on the existing global `SuspendedGuard` — no dedicated phase-6 spec.
- `charts render <500 ms @90 d` — not formally benchmarked; 90-day day-granularity payload is ~90 points × trivial aggregation.
- Root `turbo test:integration` (0_Phase.md §8) still doesn't exist — per-package command used, as documented in the phase-0 record.

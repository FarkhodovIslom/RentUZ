# Phase 4 — Rental Requests, My Rentals, Lifecycle Jobs (2026-09-11)

## Task

Implemented Phase 4 per `.kilo/plans/1789128305-phase-4-rental-requests.md` and `context/4_Phase.md` (§25/§26/§44/§54/§70/§86): the rental-request flow that converts discovery into a binding agreement — tenant submits from the details page, owner accepts/rejects, the property becomes RENTED with competitors auto-rejected, nightly jobs complete/expire rentals, and a notifications stub records every transition. Branch `feature/phase-4-rental-requests`; no commits (AGENTS.md).

## Key finding

The database was already Phase-4-ready from Phase 1: `rentalRequests` (with snapshot fields), `RentalStatus` incl. EXPIRED, the partial unique index on PENDING duplicates, and the `notifications` model all existed — **no migration was needed**.

## Files changed

**Contracts** (`packages/contracts/src/`)
- `rental-requests.ts` (new) — `CreateRentalRequestInput` (message 20–1000, startDate ≤90 d window as a **string** — see deviations, duration 1–36), `UpdateRentalRequestInput` (role-gated ACCEPTED/REJECTED/CANCELLED), `RentalRequestDTO` (with derived `endDate`, `tenantCard` for owner view), `RequestStatus`, `MyRentalsTab`, `RentalRequestListQuery`; + `rental-requests.test.ts`.

**API** (`apps/api/src/`)
- `modules/rental-requests/` (new) — `rental-requests.service.ts` (create w/ FX snapshot + 23505→`DUPLICATE_PENDING_REQUEST`; **race-safe accept** via `$transaction` + `SELECT … FOR UPDATE` + conditional rowcount updates + competitors captured pre-flip; reject/cancel; listMy/listForOwner with card hydration via `property-card.mapper`; `completeExpiredRentals`/`expireStalePending` idempotent job entry points), `rental-requests.controller.ts` (+ `OwnerRentalRequestsController` for `/owner/rental-requests`), `rental-lifecycle.service.ts` (date-fns `addMonths` endDate, isActive), `rental-requests.module.ts`.
- `common/services/event-bus.service.ts` + `event-bus.module.ts` (new, @Global) — thin emit/on wrapper (listener errors caught+logged).
- `modules/notifications/` (new) — stub `enqueue()` writing to the table; subscribes to all six `rental_request.*` events, mapping to `NotifType` (closest member + distinct `bodyKey` for cancelled/completed/expired).
- `modules/jobs/` — `complete-rentals.processor.ts` (hourly), `expire-pending-requests.processor.ts` (6 h), `jobs-admin.controller.ts` (`GET /jobs`, `@Roles('ADMIN')`, BullMQ introspection), scheduling + queues wired in `jobs.service.ts` / `jobs.module.ts`.
- `common/global-exception.filter.ts` — **fix**: surfaces `HttpException({ code })` domain codes as `error.code` (previously squashed to `CONFLICT`/`FORBIDDEN` — see deviations).
- `app.module.ts` — EventBusModule (global), RentalRequestsModule, NotificationsModule.
- `package.json` — `date-fns@4.1.0` (exact pin).
- `test/rental-requests-flow.integration.test.ts` (new, 22 tests) — full §3 matrix incl. concurrent-accept race (exactly one 200 + one 409), suspended/anonymous/role 403s, job idempotency, `/jobs` admin gate.

**Web** (`apps/web/src/`)
- `components/rentals/` (new) — `RentalRequestModal` (RHF+Zod, frozen price preview, duplicate/unavailable states, 401→login hand-off), `StatusBadge`, `RequestsBadge` (60 s polling), `RequestActions` (confirm + `router.refresh()`, no hard reload — a reload raced the toast), `CancelRequestButton`.
- Pages: `(public)/property/[slug]/page.tsx` (modal wired desktop aside + mobile CTA), `(tenant)/rental-requests/page.tsx`, `(tenant)/my-rentals/page.tsx` (§26 four tabs, ACTIVE = ACCEPTED with future end), `(owner)/owner/requests/page.tsx` (sidebar un-`soon`ed).
- Nav: Navbar "So'rovlar" + badge; BottomNav 6th slot (grid-cols-6). `messages/uz.json` `nav.requests`.

**E2E** (`apps/web/e2e/`)
- `helpers.ts` — `provisionProperty()` (register→draft→PATCH all FULL_VALIDATION_KEYS incl. regionId from `/public/locations`→submit→slug read back from `GET /properties/:id`; draft/submit responses carry no slug), `submitRequest()`.
- New specs: `request-create.spec.ts`, `owner-accept.spec.ts` (asserts the accepted property's **slug** disappears from `/rentals` — earlier runs leak same-titled leftovers), `my-rentals.spec.ts`.

## Deviations from 4_Phase.md (recorded in its header)

1. EventBus (Node EventEmitter) instead of @nestjs/event-emitter — Phase 3 precedent.
2. No `ALTER TYPE` migration — EXPIRED existed since Phase 1.
3. Flat jobs layout (no `processors/` subfolder, no QueueScheduler).
4. `pricing.service` consolidated into the main service (one `FxService.toUzs` call); only lifecycle math is separate.
5. `/jobs` reads BullMQ directly — no run-log table.
6. Cancelled/completed/expired notifications reuse closest `NotifType` + distinct `bodyKey`s (enum lacks members; Phase 6 may extend).
7. `startDate` stays a **string** on the wire: `z.coerce.date()` crashes the swagger converter ("Date cannot be represented in JSON Schema") at boot.
8. **`GlobalExceptionFilter` fix** (also benefits Phase 2/3 endpoints): domain error codes now pass through to `error.code`.
9. Web page at `/owner/requests`; API routes per spec (`/owner/rental-requests`).

## Verification (documented order, all green)

| Gate | Result |
| --- | --- |
| `pnpm lint` | ✓ 4/4 tasks |
| `pnpm typecheck` | ✓ 5/5 tasks |
| `pnpm test` (unit) | ✓ contracts 28 + api 53 |
| `pnpm --filter api test:integration` | ✓ 57/57 (22 new) |
| `pnpm build` | ✓ |
| `pnpm --filter web test:e2e` | ✓ **8/8** (5 Phase 3 + 3 new), run twice |
| Boot gate | `/health` 200, `/ready` 200 (db+redis ok) |
| Manual curl smoke | request→accept→property RENTED ✓; **concurrent-accept race: one 200 + one 409, loser auto-REJECTED** ✓; notification rows (REQUEST_NEW/ACCEPTED/REJECTED) ✓; `GET /jobs` as admin 200, as owner 403 ✓ |

Environment: colima + compose stack (db/redis/minio healthy); reseeded after integration tests (trap 15: integration truncates cascade from users and wipes the seed E2E depends on).

## Remaining limitations / debts

- **Pre-existing (not Phase 4)**: `GET /properties/me` 500s for owners with seeded properties — `BigInt` serialization in the owner listing (`views`/`priceUzs`). Reproduced during smoke; needs a `Number()` pass at the DTO boundary like `PropertyCardDTO`. Recommend fixing early in Phase 5 (the owner dashboard E2E path).
- The seed's `??` fallback doesn't guard `.env`'s `ADMIN_INITIAL_PASSWORD=` (empty string hashed): reseed the admin with `ADMIN_INITIAL_PASSWORD=… pnpm db:seed` after deleting the row. Worth normalizing in `.env.example`/seed.
- Notification *read* endpoints + bell UI are Phase 6; `NotifType` extension for cancelled/completed/expired is deferred with the bodyKey workaround.
- `my-rentals` ACTIVE tab derives "past end" client-side (filters by `endDate > now`) — the hourly job is the authoritative sweeper; a row can appear under ACTIVE briefly after its end until the job runs.
- Jobs are tested by direct service invocation (DISABLE_JOBS in tests/E2E); cron-fire behavior relies on BullMQ repeatables with stable jobIds (same mechanism as the pre-existing fx/orphan jobs).
- No commits made (AGENTS.md workflow); Lighthouse + mobile screenshots were not re-taken for the new pages (defer to the Phase 8 SEO/polish pass).

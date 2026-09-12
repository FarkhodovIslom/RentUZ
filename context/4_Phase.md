# RentUZ MVP — Phase 4: Rental Requests, My Rentals, Lifecycle Jobs

> **Status (2026-09-11): COMPLETE.** All §1 tasks implemented; verification gate green
> (lint, typecheck, unit 53, integration 57, build, E2E 8/8, boot + curl smoke incl.
> the concurrent-accept race). Deviations from the original plan recorded in
> `walkthroughs/phase-4-rental-requests.md` and summarized below:
>
> 1. **EventBus instead of @nestjs/event-emitter** (§1.1 item 5) — thin
>    `common/services/event-bus.service.ts` (Node EventEmitter, @Global module),
>    consistent with the Phase 3 decision to keep the package uninstalled.
> 2. **No migration** (§2) — `RentalStatus.EXPIRED` already existed from Phase 1;
>    the `ALTER TYPE` was never needed. The partial unique index was also already
>    in place.
> 3. **Flat jobs layout** (§1.2 paths) — `complete-rentals.processor.ts` /
>    `expire-pending-requests.processor.ts` in `modules/jobs/`, matching the
>    existing flat `jobs.processor.ts` style; no `processors/` subfolder, no
>    QueueScheduler (stable-`jobId` repeatables, as before).
> 4. **`pricing.service.ts` consolidated** into `rental-requests.service.ts`
>    (the snapshot is one `FxService.toUzs` call); only `rental-lifecycle.service.ts`
>    (`materializeEndDate`/`isActive`, date-fns UTC) is separate.
> 5. **`/jobs` admin endpoint** reads BullMQ `getJobs` + `getJobSchedulers`
>    directly — no run-log table (DoD satisfied with zero schema additions).
> 6. **NotifType mapping**: CANCELLED/COMPLETED/EXPIRED events enqueue under the
>    closest existing enum member with distinct `bodyKey`s + `data.status` —
>    the Phase 1 `NotifType` enum has no members for them; Phase 6 may extend.
> 7. **`startDate` wire format**: `z.string()` (date-only `YYYY-MM-DD` or ISO
>    datetime), converted to `Date` in the service — `z.coerce.date()` cannot be
>    expressed in JSON Schema and crashes @nestjs/swagger's converter at boot.
> 8. **Error-code passthrough fix**: `GlobalExceptionFilter` now surfaces
>    `new HttpException({ code })` payloads as `error.code` (previously squashed
>    to the generic status-based code — `DUPLICATE_PENDING_REQUEST` etc. never
>    reached clients, including pre-existing Phase 2/3 endpoints).
> 9. Web owner page path is `/owner/requests` (the sidebar's existing link),
>    API routes stay `GET /owner/rental-requests` per §44.
>
> Cross-cutting decisions live in `0_Phase.md`. Property/owner rules are in `2_Phase.md`. Search and details are in `3_Phase.md`. This phase introduces the request flow that converts discovery into a binding rental agreement, plus the background jobs that move requests through their lifecycle.

## Goal
A tenant can submit a rental request from a property's details page (with a message, start date, and duration). The owner can see it in their dashboard and accept/reject it. On acceptance, the property becomes RENTED, all competing PENDING requests for that property are rejected, and a notification is queued (the actual delivery ships in Phase 6). A nightly job marks completed rentals COMPLETED and resets the property to ACTIVE if no other active rental exists. The tenant's "My Rentals" view (§26) covers Active / Pending / Completed / Cancelled.

## Scope (spec coverage)
§25 (rental request payload), §26 (my rentals), §44 (rental request API), §54 (business rules — owner-only operations, suspended user blocks, request price snapshot), §70 (background jobs), §86 (rental request lifecycle). The thin notification emitter ships in this phase; the full notifications surface is Phase 6.

## Out of scope this phase
- Chat/contact between tenant and owner beyond a request (Phase 5)
- Rich notification UX (Phase 6)
- Reviews after completion (Phase 2 product)
- Payment history (Phase 2 product — the spec §26 mentions it; we model it as the rental's own snapshot for MVP)

---

## 1. Tasks (ordered, with paths)

### 1.1 Domain — services
1. `apps/api/src/modules/rental-requests/rental-requests.service.ts`:
   - `create({ tenantId, propertyId, message, startDate, durationMonths })`:
     1. Load property (must be `ACTIVE`, not the owner's own). 403 `INSUFFICIENT_PERMISSIONS` if owner === tenant.
     2. Validate: `durationMonths ∈ [1, 36]`, `startDate` is in the future and not more than 90 days out (configurable).
     3. Suspended tenant → 403.
     4. **Snapshot price**: read current `price`, `currency`, compute `priceUzsSnapshot = fxService.toUzs(price, currency)` at this instant.
     5. Compute `endDate = startDate + durationMonths months` (JS-side, store only `startDate` and `durationMonths`; endDate derived on read).
     6. Insert. The partial unique index on `(tenantId, propertyId) WHERE status='PENDING'` will reject a duplicate PENDING → surface as `CONFLICT` `DUPLICATE_PENDING_REQUEST`.
     7. Emit `rental_request.created` event (Phase 6 wires it to notifications).
   - `accept({ ownerId, requestId, note? })`:
     1. Load request + property. Owner must own the property; suspended owner → 403.
     2. **Race-safe transaction** (`prisma.$transaction([...], { isolationLevel: 'Serializable' })`):
        - `SELECT ... FOR UPDATE` on `properties` row.
        - Verify `property.status === 'ACTIVE'`. If `RENTED`/`PAUSED`, abort with `CONFLICT` `PROPERTY_NOT_AVAILABLE`.
        - `UPDATE rental_requests SET status='ACCEPTED', decidedAt=now(), decidedBy=ownerId WHERE id=... AND status='PENDING'`.
        - `UPDATE properties SET status='RENTED' WHERE id=...`.
        - `UPDATE rental_requests SET status='REJECTED', decisionNote='Auto-rejected: property rented' WHERE id IN (competing PENDING for the same property) AND id <> requestId`.
        - All updates return row counts; if any conditional update returns 0 rows, throw to roll back the transaction.
     3. Emit `rental_request.accepted` and `rental_request.rejected` (one each for the auto-rejected competitors).
   - `reject({ ownerId, requestId, note? })` — non-accepting owner; just `status='REJECTED'`. Same conditional update.
   - `cancel({ tenantId, requestId })` — tenant cancels their own PENDING. `status='CANCELLED'`.
   - `complete({ requestId })` — internal; called by the nightly job. `status='COMPLETED'`, `decidedAt=now()`. Resets property if appropriate.
   - `listMy(tenantId, status?)` — for the tenant view, includes property card data.
   - `listForOwner(ownerId, status?)` — for the owner view.
2. `apps/api/src/modules/rental-requests/pricing.service.ts`:
   - `snapshot(property)` — returns `{ priceSnapshot, currency, priceUzsSnapshot }` using the current property price + current FX rate. Called both by `create` and by the Phase 6 FX job when it recomputes `priceUzs` on properties (so a stale request snapshot is preserved — it does **not** auto-update).
3. `apps/api/src/modules/rental-requests/lifecycle.service.ts` — `materializeEndDate(rental)` → `Date`. `isActive(rental)` → `rental.status === 'ACCEPTED' && now < endDate(rental)`.
4. `apps/api/src/modules/rental-requests/rental-requests.controller.ts` (§44):
   - `POST /rental-requests` — tenant; body validated via `CreateRentalRequestInput`
   - `GET /rental-requests/my` — tenant; `?status` filter; pagination
   - `GET /rental-requests/:id` — must be the tenant, the owner, or admin
   - `PATCH /rental-requests/:id` — `{ status, note? }`; guards decide which transitions are allowed per role
   - `GET /owner/rental-requests` — owner; `?status` filter; pagination
   - `GET /owner/rental-requests/:id` — owner read
5. `apps/api/src/common/services/event-emitter.service.ts` — Nest `EventEmitter2` wrapper, namespaced events (`rental_request.created`, `rental_request.accepted`, `rental_request.rejected`, `rental_request.cancelled`, `rental_request.completed`). Phase 6 subscribes a notification listener.
6. `apps/api/src/modules/notifications/notifications.stub.ts` — Phase 4 ships a thin `NotificationsService` with one method `enqueue(notif)` that writes to the `notifications` table; no fetch endpoints, no bell UI yet. Phase 6 expands it.

### 1.2 Background jobs
7. `apps/api/src/modules/jobs/jobs.module.ts` — wires BullMQ + ioredis; defines the `RentuzQueue`.
8. `apps/api/src/modules/jobs/processors/complete-rentals.processor.ts` — repeatable (every hour; cron `0 * * * *` Asia/Tashkent equivalent): select all `rental_requests` with `status='ACCEPTED'` whose `startDate + durationMonths < now()`, mark `COMPLETED` in a single transaction, and for each completed one, recompute the property's status:
   - If there is any other `ACCEPTED` request whose end is in the future, keep the property `RENTED`.
   - Else, set `properties.status='ACTIVE'`.
9. `apps/api/src/modules/jobs/processors/expire-pending-requests.processor.ts` — repeatable (every 6 h): for PENDING requests where `startDate < now() - 1 day`, set `status='EXPIRED'` (the new status from `1_Phase.md` §2). Emit a notification per request.
10. Both processors are idempotent: re-running them is a no-op.
11. Register the `RentuzQueue` and processors in `app.module.ts`; on startup, `QueueScheduler` is started for repeatable jobs.

### 1.3 Web
12. `apps/web/src/app/(public)/property/[slug]/page.tsx` — the "Ijara so'rovi" button is already in Phase 3's layout; Phase 4 wires it to a `RentalRequestModal` (RHF + Zod), submits to `POST /rental-requests`, shows a success state ("So'rov yuborildi — owner tez orada bog'lanadi") and an error state with retry.
13. `apps/web/src/components/rentals/RentalRequestModal.tsx` — fields: message (textarea, 20–1000 chars), startDate (date picker, min today, max +90 d), duration (number input, 1–36 months). Shows the **frozen** price snapshot preview ("E'lon narxi: 3 500 000 so'm / oy") and a note that the final price is the owner's accepted terms. CTA: "Yuborish".
14. `apps/web/src/app/(tenant)/rental-requests/page.tsx` — list of my requests; status tabs (Barchasi, Kutayotgan, Qabul qilingan, Rad etilgan, Yakunlangan). Empty state per §66.
15. `apps/web/src/app/(tenant)/my-rentals/page.tsx` — per §26, four tabs: Active, Pending, Completed, Cancelled. Active rental card shows: property, owner, start, end, price, contact button (Phase 5 wires the chat link), status.
16. `apps/web/src/app/(owner)/owner/requests/page.tsx` — owner list with status tabs; "Qabul qilish" / "Rad etish" buttons with optional note; row click → drawer with full request detail + tenant card + property card.
17. `apps/web/src/components/rentals/RequestActions.tsx` — accept/reject with a confirm modal (cannot be undone). Optimistic update + rollback on error.
18. `apps/web/src/components/rentals/StatusBadge.tsx` — per status, with the §3 yellow accent for ACTIVE/ACCEPTED.
19. `apps/web/src/app/(tenant)/layout.tsx` (Phase 1 had a stub) — add a "So'rovlar" nav entry; in the navbar, show a small badge with the count of PENDING+ACCEPTED requests (TanStack Query polls `GET /rental-requests/my?status=ACCEPTED` and `?status=PENDING` every 60 s + on focus).

### 1.4 i18n keys
`request.create.*` (modal labels), `request.status.*` (PENDING/ACCEPTED/REJECTED/CANCELLED/EXPIRED/COMPLETED — Uzbek labels), `request.actions.accept`, `request.actions.reject`, `request.actions.cancel`, `request.detail.*`, `myRentals.title`, `myRentals.tabs.*`, `owner.requests.title`, `owner.requests.empty`. The owner notification "New request received" string lives in i18n but is delivered in Phase 6.

### 1.5 API contracts
20. Zod in `packages/contracts`:
    ```ts
    export const CreateRentalRequestInput = z.object({
      propertyId: z.string().uuid(),
      message: z.string().min(20).max(1000),
      startDate: z.coerce.date().refine(d => d >= startOfDay(new Date()) && d <= addDays(new Date(), 90), "Start date must be within 90 days"),
      durationMonths: z.number().int().min(1).max(36),
    });
    export const UpdateRentalRequestInput = z.object({
      status: z.enum(["ACCEPTED","REJECTED","CANCELLED"]),
      note: z.string().max(500).optional(),
    });
    ```

---

## 2. Database changes
- **No new tables**. New migration: `ALTER TYPE rental_status ADD VALUE 'EXPIRED';` (Postgres enum extension is non-transactional — must run outside a transaction; `prisma migrate` is fine because it manages this for the connection that runs it). Verify via `\dT+ rental_status` after migrate.
- The partial unique index from Phase 1 is in place: `(tenantId, propertyId) WHERE status='PENDING'`.

---

## 3. Tests

Unit:
- `pricing.snapshot` is deterministic for a given property + FX row
- `isActive` and `materializeEndDate` math (DST safe — we use `date-fns` UTC arithmetic, then convert to Tashkent for display)
- `accept` and `cancel` transition rules

Integration (PostGIS + Redis):
- Tenant creates a request → 201, snapshot stored, partial unique index in DB
- Same tenant creates another PENDING for the same property → 409 `DUPLICATE_PENDING_REQUEST`
- Different tenants can both have PENDING on the same property
- Owner accepts → request ACCEPTED, property RENTED, competitor requests REJECTED, audit events emitted
- Two owners click "Accept" on competing PENDINGs concurrently — only one transaction commits (Serializable isolation enforced); the other gets 409 `PROPERTY_NOT_AVAILABLE`
- Tenant cannot accept their own request → 403
- Suspended tenant cannot create → 403
- `cancel` only by the tenant who created it
- `complete` job: an ACCEPTED request past its end → COMPLETED, and if no other active rental, property back to ACTIVE
- `expire-pending-requests` job: PENDING older than 1 day past startDate → EXPIRED
- Job idempotency: re-running on the same data is a no-op

Security:
- Owner of property A cannot read/operate on requests for property B → 403
- Tenant A cannot read tenant B's request → 403
- Anonymous cannot create → 401

Web E2E (Playwright):
- Tenant on details → open modal → fill → submit → success state; on refresh, request appears in `/rental-requests`
- Owner: open `/owner/requests` → accept → see status change in list; the property disappears from `/rentals` search
- Tenant: open `/my-rentals` → see Active rental card

---

## 4. Definition of Done
- All paths in §1 implemented; lint+typecheck+unit+integration+E2E green
- The two jobs are visible in a small admin endpoint `/jobs` (gated `@Roles('ADMIN')`) that lists the last 20 runs and the next scheduled time
- A serialized load test with 50 concurrent `accept` calls against 1 property confirms exactly 1 success and 49 `CONFLICT` responses
- `notifications` table has rows after each create/accept/reject/cancel (Phase 6 makes them visible)

## 5. Risks & escape hatches
- **Serializable isolation performance** — single-row contention is the only cost; a single index `FOR UPDATE` on the property row is enough. The `rental_requests` table is updated by id (primary key lookup). No hot-row issue.
- **FX snapshot drift** — a request's `priceUzsSnapshot` is intentionally a frozen value at creation. A price change on the property does **not** mutate existing request snapshots — this matches §25 explicitly. The price-change notification (Phase 6) is informational only.
- **Time zones in `startDate`** — `startDate` is a `Date` (date, not timestamp) stored UTC. The owner and tenant both see it in Asia/Tashkent. `date-fns` UTC helpers throughout.
- **Job retries** — BullMQ retries on transient failures (3x, exponential). Idempotency is the contract.
- **EXPIRED status is missing from the original spec §86** — explicit deviation, added because the spec doesn't address abandoned PENDINGs and they're a real-world risk.

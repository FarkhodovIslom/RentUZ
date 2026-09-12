# Phase 4 — Rental Requests, My Rentals, Lifecycle Jobs (implementation plan)

Branch: `feature/phase-4-rental-requests` from `main` (rebase on latest Phase 3 merge).
Authoritative docs: `context/4_Phase.md` (tasks, §25/§26/§44/§54/§70/§86), `context/0_Phase.md` (pins, traps, conventions), `walkthroughs/phase-3-search.md` (fresh debts: basemap tiles external, Navbar not session-aware).

## Resolved decisions (this planning session — record deviations in `4_Phase.md`)

1. **No schema migration needed.** The `rentalRequests` table, `RentalStatus` enum (EXPIRED already present), partial unique index `(tenantId, propertyId) WHERE status='PENDING'`, snapshot fields (`priceSnapshot`, `currency`, `priceUzsSnapshot`), and `notifications` model/`NotifType` enum all exist from Phase 1. `4_Phase.md` §2 ("ALTER TYPE ... ADD VALUE 'EXPIRED'") is already satisfied — record as resolved, not a deviation.
2. **EventBus, not @nestjs/event-emitter** (deviation from §1.1 item 5, consistent with Phase 3's decision to keep it uninstalled): a small `common/services/event-bus.service.ts` — `emit(event, payload)` / `on(event, handler)` over Node's `EventEmitter` — enough for the notifications stub to subscribe. Phase 6 can swap internals without touching call sites.
3. **date-fns for API only** (regular dep, exact pin `4.1.0` in `apps/api`): the 90-day window and `materializeEndDate` need UTC-safe month math. Web stays native (`Intl.DateTimeFormat` + `<input type="date">`) — no date lib on the web side.
4. **Jobs layout = flat, not `processors/` subfolder** (deviation from §1.2 paths): both new processors live as separate files in `src/modules/jobs/` (`complete-rentals.processor.ts`, `expire-pending-requests.processor.ts`), matching the existing flat `jobs.processor.ts` style, wired via `jobs.module.ts` `registerQueue` + `JobsService.onModuleInit` stable-`jobId` scheduling (hourly `'0 * * * *'` complete-rentals; `'0 */6 * * *'` expire-pending). No QueueScheduler (BullMQ 6 workers handle repeatables).
5. **Serializable accept-transaction via `$executeRaw` FOR UPDATE, with Prisma 7 interactive-transaction timeout raised** (`{ timeout: 10_000 }`): the properties.service.ts:125-131 caveat (5s default) applies. Scope: `SELECT ... FOR UPDATE` on the property row → conditional updates returning rowcounts → all-or-nothing throw. Competing accepts → exactly one commit, losers get 409 `PROPERTY_NOT_AVAILABLE`.
6. **Suspended-tenant/owner blocking is already global** via `SuspendedGuard` (403 on mutations) — no per-method checks; integration tests assert by flipping user status in DB.
7. **Throttling**: `@Throttle({ key: 'rental-requests-create', points: 10, duration: 60 })` on POST /rental-requests (existing Redis ThrottleGuard, per-user).
8. **Notifications stub** = `notifications/notifications.service.ts` with `enqueue({ userId, type, titleKey, bodyKey, data })` writing to the table; subscribes to all six `rental_request.*` EventBus events in its module — Phase 6 adds read endpoints + bell UI on top.
9. **pricing.service consolidated** into the main service (snapshot is one `FxService.toUzs` call); only `lifecycle.service.ts` (`materializeEndDate` via date-fns UTC `addMonths`, `isActive`) is separate. endDate derived on read, never stored (§25).
10. **API routes per spec** (`GET /owner/rental-requests`); web page at `/owner/requests` (the existing sidebar link — un-`soon` it).
11. **Mobile CTA**: "Ijara so'rovi" joins the mobile sticky bar as a compact button opening the same modal.
12. **Anonymous rental-request attempt** → 401 → `/login?next=` hand-off (no replay — the form needs fresh input anyway).
13. Map components untouched (Phase 3 scope, including its basemap limitation).

## Contracts (`packages/contracts/src/rental-requests.ts` — new; export from `index.ts`)

- `CreateRentalRequestInput = z.object({ propertyId: z.string().uuid(), message: z.string().min(20).max(1000), startDate: z.coerce.date().refine(future && ≤ +90d via native UTC-day math — no date-fns in contracts), durationMonths: z.number().int().min(1).max(36) })`.
- `UpdateRentalRequestInput = z.object({ status: z.enum(['ACCEPTED','REJECTED','CANCELLED']), note: z.string().max(500).optional() })` — role gating service-side (owner: ACCEPTED/REJECTED, tenant: CANCELLED).
- `RentalRequestDTOT`: `{ id, propertyId, propertyCard: PropertyCardDTOT, message, startDate, durationMonths, endDate (derived), priceSnapshot, currency, priceUzsSnapshot, status, decidedAt?, decisionNote?, createdAt, tenantCard?: { name, avatar? } (owner view) }`.
- `RequestStatus = z.enum(['PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED','COMPLETED'])`; `MyRentalsTab = z.enum(['ACTIVE','PENDING','COMPLETED','CANCELLED'])`.
- Pagination reuses `pagination.ts`. Error codes `PROPERTY_NOT_AVAILABLE` + `DUPLICATE_PENDING_REQUEST` already exist.
- Unit tests `rental-requests.test.ts`: date-window boundaries (today, +90d, +91d, past), duration 1/36, message 20/1000, status enums.

## API — `apps/api/src/modules/rental-requests/`

### rental-requests.service.ts
- `create`: load property (404 missing/DELETED; 403 own property; 409 non-ACTIVE) → snapshot via `FxService.toUzs` → insert; catch Postgres 23505 on `rental_requests_pending_uniq` → 409 `DUPLICATE_PENDING_REQUEST` → emit `rental_request.created`.
- `accept`: ownership pre-check → serialized tx (FOR UPDATE property; assert ACTIVE else 409; conditional ACCEPTED update, rowcount 0 ⇒ 409; property → RENTED; auto-REJECT competing PENDINGs) → after commit: `searchCache.bumpVersion()` (RENTED leaves search), events + notifications (REQUEST_ACCEPTED to tenant, REQUEST_REJECTED per competitor).
- `reject` / `cancel`: role-checked conditional updates (PENDING only), events.
- `listMy` / `listForOwner`: paginated, card hydration via existing `property-card.mapper.ts` (images take-1, region), owner rows include tenant `{ name, avatar }`; `endDate` computed per row via lifecycle service.
- `findOne`: tenant | owner of property | admin, else 403.
- `completeInternal({ now })` (job-only): tx of conditional updates — ACCEPTED past endDate → COMPLETED; per affected property, no other future-end ACCEPTED → property ACTIVE (`RENTED → ACTIVE` pre-annotated in status.service.ts); one `bumpVersion()`; `rental_request.completed` per row.
- `expireInternal({ now })`: PENDING with `startDate < now - 1 day` → EXPIRED; per-row events.

### rental-requests.controller.ts (§44)
`POST /rental-requests` (Throttle 10/min) · `GET /rental-requests/my` (?status) · `GET /rental-requests/:id` · `PATCH /rental-requests/:id` (UpdateRentalRequestInput) · `GET /owner/rental-requests` (+ `/:id`) via a second `@Controller`.

### Notifications stub
`notifications.module.ts` + `notifications.service.ts`: `enqueue(...)` → `prisma.notifications.create`; subscribes to the six events in `onModuleInit` mapping to REQUEST_NEW / REQUEST_ACCEPTED / REQUEST_REJECTED / REQUEST_REJECTED / REQUEST_CANCELLED?? — NotifType has REQUEST_NEW/ACCEPTED/REJECTED (cancelled/completed/expired map to closest existing types or use bodyKey differentiation; `NotifType` enum is fixed — use REQUEST_REJECTED for CANCELLED? No: record decision: cancelled/completed/expired notifications use `REQUEST_REJECTED`? **No** — they enqueue with type REQUEST_ACCEPTED/REQUEST_REJECTED/REQUEST_NEW only where a type exists; cancelled → REQUEST_REJECTED with bodyKey `request.cancelled`? **Decision: CANCELLED/COMPLETED/EXPIRED enqueue with the closest semantic type and distinct `bodyKey`s — data carries `status` for Phase 6 UI.**)

### Jobs
- `complete-rentals.processor.ts` — `@Processor('complete-rentals', { concurrency: 1 })`; calls `completeInternal(new Date())`; idempotent (conditional updates only).
- `expire-pending-requests.processor.ts` — `@Processor('expire-pending-requests', { concurrency: 1 })`; calls `expireInternal`.
- `jobs.module.ts`: two new `registerQueue` entries; imports `RentalRequestsModule` (service export — no cycle); `jobs.service.ts`: two `queue.add` calls, stable jobIds `complete-rentals-hourly` / `expire-pending-6h`.
- `/jobs` admin endpoint: `jobs.controller.ts`, `@Roles('ADMIN')`, reads BullMQ `queue.getJobs(['completed','failed','delayed'], 0, 20)` + `getJobSchedulers()` for next runs — no new table.

## Web — `apps/web`

1. `components/rentals/RentalRequestModal.tsx` (client) — FilterDrawer overlay markup (`role="dialog" aria-modal`), RegisterForm RHF+Zod flow, FavoriteButton 401 hand-off. Props `{ propertyId, price, currency, period }`. Fields: message (Textarea 20–1000), startDate (`<input type="date" min=today max=+90d>`), durationMonths (1–36). Frozen price preview. States: success, `DUPLICATE_PENDING_REQUEST`, `PROPERTY_NOT_AVAILABLE`.
2. Details page: replace disabled button (aside lines ~194-201) with modal opener; add compact opener to mobile sticky CTA.
3. `(tenant)/rental-requests/page.tsx` — favorites-page skeleton; status tabs via `?status=`; cancel button (PENDING) via client component; EmptyState + Pagination.
4. `(tenant)/my-rentals/page.tsx` — four tabs (§26); Active = status ACCEPTED; card shows property, dates, price snapshot, disabled contact (Phase 5).
5. `(owner)/owner/requests/page.tsx` — tabs, rows (property mini + tenant + message + dates), detail drawer (FilterDrawer panel pattern), `RequestActions`.
6. `components/rentals/RequestActions.tsx` — react-query `api.patch`, optimistic update + rollback, confirm modal, toasts; invalidates `['requests-list']` + `['requests-count']`.
7. `components/rentals/StatusBadge.tsx` — Badge wrapper; yellow `#FFA31A` accent for ACCEPTED/ACTIVE (§3).
8. `RequestsBadge` (FavoritesBadge clone, 60 s polling `?status=PENDING` count) + Navbar "So'rovlar" entry + BottomNav 6th slot (grid-cols-6).
9. i18n `uz.json`: `request.*`, `myRentals.*`, `ownerRequests.*`, `nav.requests`.
10. No BFF changes (catch-all proxy handles PATCH already).

## E2E (3 new specs; helpers reuse + one new helper)

- `provisionProperty(page)` helper: register owner → `POST /properties` (draft) → `PATCH /properties/:id` with `PropertyUpdateInput` covering FULL_VALIDATION_KEYS → `POST /properties/:id/submit` (AUTO_APPROVE_LISTINGS=true in E2E api env → ACTIVE). Returns `{ slug, id, owner }`.
- `request-create.spec.ts` — tenant → details → aside opener → modal → fill → submit → success; `/rental-requests` shows card (Kutayotgan).
- `owner-accept.spec.ts` — provisionProperty → tenant requests → owner `/owner/requests` → accept → status flips; property absent from `/rentals`.
- `my-rentals.spec.ts` — tenant `/my-rentals` → Active card visible.

## API tests

- Unit (`src/modules/rental-requests/*.spec.ts`): lifecycle math (Jan 31 + 1m → Feb 28; isActive boundary), event names, notification mapping, snapshot call-through (FxService mocked).
- Integration `test/rental-requests-flow.integration.test.ts` (copy search-flow boot/fixtures; truncate adds `"rentalRequests"`, `"notifications"`): create 201 + snapshot; duplicate 409; two tenants both PENDING; accept → ACCEPTED + RENTED + competitors REJECTED + notifications rows; concurrent accept (Promise.all, one 200 + one 409); tenant accept own 403; suspended 403; cancel rules; completeInternal → COMPLETED + property ACTIVE; expireInternal; idempotency; security (cross-owner 403, cross-tenant 403, anonymous 401); `/jobs` admin 200/owner 403.

## Verification order (AGENTS.md)

`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm --filter api test:integration` (compose up, 0 flaky) → `pnpm build` → `pnpm --filter web test:e2e` (8 specs) → boot gate (`node dist/main.js`: /health, /ready) + manual curl (accept-race, /jobs, notification rows) → Lighthouse + 375/1280px screenshots (record, not gate).

## Docs updates (with the PR)

- `context/4_Phase.md`: mark tasks done; record deviations (EventBus, consolidated pricing, flat jobs, no migration, /jobs via BullMQ introspection, cancelled/completed/expired notification-type mapping).
- `context/0_Phase.md` §1 traps: Prisma 7 interactive-tx 5s default (raise for FOR UPDATE chains); 23505 constraint-name matching for partial-unique violations; BullMQ repeatable jobId idempotency now load-bearing.
- `walkthroughs/phase-4-rental-requests.md` (task, files, verification, limitations).

## Risks / accepted limitations

- Concurrent-accept test determinism — FOR UPDATE serializes; assert exactly one 200 / one 409.
- BigInt `priceUzsSnapshot` — `Number()` at the DTO boundary (Phase 3 precedent).
- Timezone: startDate is `@db.Date` UTC; display Asia/Tashkent via `Intl`; window refine uses UTC-day floors.
- Jobs tested by direct invocation (cron-fire untested by design; DISABLE_JOBS in CI/E2E).
- E2E property helper must satisfy FULL_VALIDATION_KEYS before submit.
- NotifType enum has no CANCELLED/COMPLETED/EXPIRED members — those enqueue under the closest type with distinct bodyKeys + `data.status` (documented deviation; Phase 6 may extend the enum).

## Task order

1. Plan file + branch + contracts + contract tests + date-fns pin
2. EventBus + notifications stub
3. rental-requests service + controller + module
4. Jobs (processors, scheduling, /jobs admin)
5. API unit + integration tests
6. Web modal + details wiring
7. Tenant pages + badges + nav + i18n
8. Owner page + RequestActions
9. Web E2E (helper + 3 specs)
10. Verification gate + Lighthouse + screenshots
11. Docs (4_Phase, 0_Phase traps, walkthrough)

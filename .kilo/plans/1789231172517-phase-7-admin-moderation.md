# Phase 7 — Admin, Verification, Reports, Audit (full DoD)

Target: new worktree `/Users/farkhodov/Desktop/RentUZ-phase7`, branch `feature/phase-7-admin-moderation` off `feature/phase-6-notifications-analytics` (8 commits, bd71b4a). Phase 5 working tree (main repo, uncommitted chat work) is NOT touched. All Phase 7 code lives only in the new worktree.

Verified against the phase-6 tree before planning: `reports`/`auditLogs` tables exist; `ReportPriority` has no `CRITICAL`, `NotifType` has no `VERIFICATION_INFO_REQUESTED`, `properties` has no `pausedReason` (migration is real work, not a no-op); error codes `OWNER_SUSPENDED`/`CANNOT_REPORT_SELF`/`REPORT_ALREADY_OPEN` already exist in `packages/contracts/src/error-codes.ts`; Phase 6 shipped `NOTIFICATIONS_READ_RETENTION_DAYS`/`NOTIFICATIONS_UNREAD_RETENTION_DAYS` (env.ts + cleanup processor) — the `*_TTL_DAYS` names in 7_Phase.md §1.9 are stale and are reconciled (see D1).

## 0. Parallel setup

1. `git worktree add /Users/farkhodov/Desktop/RentUZ-phase7 -b feature/phase-7-admin-moderation feature/phase-6-notifications-analytics` → `pnpm install`.
2. Pre-flight: `lsof -i :5436 -i :6381 -i :9210 -i :9211` — must be free (user-chosen port scheme continues 5434→5435→5436).
3. `docker-compose.phase7.yml` — copy of `docker-compose.phase6.yml`: `name: rentuz-phase7`, containers `rentuz7-*`, ports PostGIS **5436**, Redis **6381**, MinIO **9210/9211**, volumes `rentuz7_pgdata`/`rentuz7_minio`. `docker compose -p rentuz-phase7 -f docker-compose.phase7.yml up -d`.
4. `apps/api/.env` in the worktree: `DATABASE_URL`/`DATABASE_DIRECT_URL` → `:5436`, `REDIS_URL` → `redis://localhost:6381`, `STORAGE_ENDPOINT`/`PUBLIC_STORAGE_BASE_URL` → `:9210`, `ADMIN_INITIAL_PASSWORD=<dev value>` (seeded admin `+998901234567`). `apps/api/.env.example`: same vars documented + `ADMIN2_PHONE` (D6). Dev servers, if run alongside other worktrees: API `:4101`, web `:3101` (phase-6 precedent: dev on :4100, E2E self-contained on 4000/3000).
5. `pnpm --filter api db:migrate` (after migration in Task 2) + `pnpm --filter api db:seed`.

## 1. Database (ONE hand-written migration)

`apps/api/prisma/migrations/202610<ts>_phase7_admin_moderation/migration.sql` (phase-6 hand-written precedent; `SET search_path = public, extensions;` first — 0_Phase.md trap 3):

```sql
SET search_path = public, extensions;
ALTER TYPE "ReportPriority" ADD VALUE IF NOT EXISTS 'CRITICAL';
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'VERIFICATION_INFO_REQUESTED';
ALTER TABLE "properties" ADD COLUMN "pausedReason" TEXT;
CREATE INDEX IF NOT EXISTS "reports_target_idx" ON "reports" ("targetType","targetId","status");
```

- PG17 allows `ALTER TYPE ... ADD VALUE` inside Prisma's transactional migration as long as the new values are not *used* in the same transaction — they aren't.
- Raw SQL elsewhere must cast with quoted camelCase type names (`'X'::"NotifType"`) — Phase 6 trap, applies to the new enum value too.
- `schema.prisma` sync: `ReportPriority` += `CRITICAL`; `NotifType` += `VERIFICATION_INFO_REQUESTED`; `properties.pausedReason String? @db.Text`. TS-level union `'OWNER_SUSPENDED' | 'ADMIN' | 'OWNER' | null` enforced in services (no PG enum).
- No new tables.

## 2. Contracts (`packages/contracts/src/admin.ts`, `reports.ts`)

`admin.ts`: `RejectReason = z.string().min(10).max(500)`, `RejectBody`, `SuspendBody {status: ACTIVE|SUSPENDED|DELETED, reason?}`, `SetPropertyStatusBody {status: ACTIVE|PAUSED|REJECTED|DELETED, reason?}`, `FeatureFlagUpdate` (see D2), `AdminAnalyticsQuery {range: 7d|30d|90d default 30d}`, `AdminAnalyticsResponse` (KPIs + 30d series, see §4), `AdminUsersListQuery` (search/role/status/createdFrom/createdTo + cursor/limit), `AdminUserDTO` (+stats), `AdminPropertiesListQuery`, `AdminPropertyDTO`, `VerificationQueueQuery {status: PENDING|REVIEWING|APPROVED|REJECTED, type?, regionId?, cursor?, limit?}`, `VerificationDetailDTO` (property + images + owner card + priorViolations + price snapshot), `AuditListQuery` (action?/adminId?/targetType?/targetId? + cursor/limit), `AuditLogDTO`, `BulkSuspendBody {userIds ≤100, reason: RejectReason}`, `BulkSuspendResult`, `AdminRequestsListQuery` (status/propertyId/tenantId/ownerId/from/to + cursor/limit).

`reports.ts`: `REPORT_REASONS` = 7 values (`FAKE, WRONG_PRICE, WRONG_LOCATION, SCAM, DUPLICATE, INAPPROPRIATE, OTHER`), `REPORT_PRIORITIES` = `LOW..CRITICAL`, `ReportCreateInput` (targetType USER|PROPERTY|MESSAGE, targetId uuid, reason enum, description ≤1000?, evidence ≤5 `{kind: image|text, ref ≤500}`), `ReportResolveBody {action: RESOLVED|REJECTED|ESCALATED, note ≤500?, suspendTarget?, removeListing?}` with `superRefine`: note **required ≥10 chars when action=REJECTED**; `removeListing` only valid with targetType PROPERTY (service-level check too). `ReportDTO` + admin list query (status/priority/targetType + cursor/limit).

- Cursor pagination everywhere in admin lists (`CursorPaginationMeta` from `notifications.ts` is reused) — 7_Phase.md §1.3–1.5 consistently says cursor; offset stays the §92 default only for public endpoints.
- Both files exported from `index.ts`. Error codes: nothing to add (verified present).
- Input DTOs: no `z.coerce.date()` (trap 12); dates are `YYYY-MM-DD` strings, converted in services.

## 3. API — common (apps/api/src)

1. `common/guards/admin.guard.ts` — APP_GUARD registered **after** `RoleGuard`. Reads `ROLES_KEY` via Reflector: only when route requires `'ADMIN'`, enforce `request.user.role === 'ADMIN' && request.user.status === 'ACTIVE'` (JWT claim — trap 14: in tests flip role/status in DB **before** login). Else pass. Closes the suspended-admin GET hole that `SuspendedGuard` (mutations only) leaves. 403 `INSUFFICIENT_PERMISSIONS`.
2. `common/decorators/audit.decorator.ts` — `@Audit(action, targetType)` → metadata. `common/interceptors/audit-log.interceptor.ts` — global APP_INTERCEPTOR registered **before** `ResponseEnvelopeInterceptor` in the providers array (so its `tap` sees the enveloped `{success, data}` response, not the raw return). Only acts on `@Audit` routes. On success inserts `auditLogs` row:
   - `adminId` = `request.user.id` (JWT sub — never from body; the security test asserts this),
   - `action`/`targetType` from metadata,
   - `targetId` = `response.data.id ?? req.params.id ?? adminId` (column is `NOT NULL uuid`; SETTINGS/bulk routes fall back to `adminId`),
   - `metadata` = sanitized `req.body` (strip `password|otp|code|token` keys; JSON-safe).
   - Insert is awaited inside `tap` with try/catch + error log (audit failure never fails a completed request; tests assert rows land).
3. `common/services/feature-flags.service.ts` + `feature-flags.module.ts` (`@Global`, like EventBus/Redis/Prisma modules). Registry: `AUTO_APPROVE_LISTINGS` (bool), `AUTH_OTP_DEV_MODE` (bool), `NOTIFICATIONS_READ_RETENTION_DAYS` (int), `NOTIFICATIONS_UNREAD_RETENTION_DAYS` (int), `CHAT_ATTACHMENT_TTL_DAYS` (int; env default 30 — var itself arrives with Phase 5's merge, lazy `process.env` read keeps phase-7 branch bootable). Read path: 5 s in-process cache → Redis `flags:runtime:<NAME>` override → env default. Write path: `SET flags:runtime:<NAME>` + local cache invalidation.
   - **Prod hard-guard** (D3): for `AUTO_APPROVE_LISTINGS`/`AUTH_OTP_DEV_MODE`, effective value is always `false` when `NODE_ENV=production`, regardless of env or Redis override; `PATCH /admin/flags` attempting `true` on either in production → 409. The env.ts startup assertions stay untouched.
   - Migrate read sites: `properties.service.ts:164` (`submit` auto-approve), `auth.service.ts:296` (`issueOtp` dev code), `notifications-cleanup.processor.ts:26-27` (retention days) → inject `FeatureFlagsService`.
4. `app.module.ts`: register AdminGuard (after RoleGuard), AuditLogInterceptor (before envelope), import the five new modules.

## 4. API — new modules (all with `@Roles('ADMIN')` controllers except public POST /reports)

### admin/ (`modules/admin/`)
- `admin.controller.ts`:
  - `GET /admin/analytics?range=` — §57 KPIs: totalUsers, activeUsers, totalProperties (not DELETED), activeProperties, pendingVerification, openReports (OPEN+REVIEWING), rentalRequestsInRange, `revenue: 0` (MVP placeholder — payments are Phase 2 product), growth series (per Tashkent day: new users, new properties, requests; zero-filled; reuse the `isoTashkentDay`/fill pattern from `analytics.service.ts`, live aggregation — no platform rollup table).
  - `GET /admin/requests` — read-only rental-request list with filters + property card + tenant/owner `{id,name,phone}`.
  - `GET /admin/audit` — audit list (cursor, reverse chrono, filters).
  - `GET /admin/flags` / `PATCH /admin/flags` (`@Audit('FLAGS_UPDATED','SETTINGS')`) — effective values `{name, value, source: override|env-default}`; PATCH applies FeatureFlagUpdate.
- `admin.service.ts` (analytics + requests) and `audit.service.ts` — `log({adminId, action, targetType, targetId, metadata})` (used by interceptor; also callable from non-HTTP entry points) and `list({action?, adminId?, targetType?, targetId?, cursor, limit})`.

### verification/ (`modules/verification/`, path `/admin/verification`)
- `queue` — `PENDING` = status `PENDING_VERIFICATION` unclaimed; `REVIEWING` = same status **+ Redis claim** (D4); `APPROVED` = `isVerified` + ACTIVE (verifiedAt desc); `REJECTED` = status REJECTED. Annotates each row with `{claimedBy, claimedAt}` from `MGET verification:claim:<id>`.
- `get(id)` — full payload: property, images, owner card (id, name, phone, memberSince, isPhoneVerified, canListProperties, **priorViolations** = count of reports targeting the owner (USER) or any of their properties (PROPERTY), any status), lat/lng for map, description, price snapshot. 5-point checklist is web-session state only — nothing in the API.
- `approve` `@Audit('PROPERTY_APPROVED','PROPERTY')` — owner fresh-DB status check: SUSPENDED → 409 `OWNER_SUSPENDED`, no state change. Else `ACTIVE` + `isVerified` + `verifiedAt`/`verifiedBy` + emit `property.verified` (Phase 6 listener already enqueues the notification; idempotency key dedupes vs auto-approve). Delete the Redis claim.
- `reject` `@Audit('PROPERTY_REJECTED','PROPERTY')` — reason ≥10 (contract), sets `REJECTED` + `rejectionReason`, emits `property.rejected` (payload carries reason).
- `request-info` `@Audit('VERIFICATION_INFO_REQUESTED','PROPERTY')` — status unchanged; emits new event `verification.info_requested` `{propertyId, ownerId, message}`.
- `claim` — `PENDING → REVIEWING` soft: `SET verification:claim:<propertyId> '<json {adminId, adminName, at}>' EX 604800`. Not audited.
- Add `VERIFICATION_INFO_EVENTS = ['verification.info_requested']` + payload to `event-bus.service.ts` (additive — keep away from `MESSAGE_EVENTS` to minimize the Phase 5 rebase conflict).
- `notification-listeners.ts`: new `on('verification.info_requested')` case → enqueue `VERIFICATION_INFO_REQUESTED`, titleKey `notifications.types.verificationInfoRequested`, bodyKey `verification.infoRequested`, data `{key: 'verification:<id>:info:<sha1(message)>' (distinct messages notify, replays dedupe), message, propertyId, context:'property'}`.

### reports/ (`modules/reports/`)
- `POST /reports` — auth required, `@Throttle({key:'reports', points:10, duration:3600})` per user. Self-report → 400 `CANNOT_REPORT_SELF` (USER: target id; PROPERTY: ownerId; MESSAGE: senderId). Duplicate open (same reporter+targetType+targetId, status OPEN|REVIEWING) → 409 `REPORT_ALREADY_OPEN` (uses the new index). Priority auto-derive: `SCAM|FAKE|DUPLICATE→HIGH`, `WRONG_PRICE|WRONG_LOCATION→MEDIUM`, else `LOW`. `CRITICAL` only via admin escalation. Target must exist (USER/PROPERTY not DELETED/MESSAGE) → else 404. Suspended reporters blocked by the global SuspendedGuard (mutation).
- `GET /admin/reports` + `GET /admin/reports/:id` — list/detail with reporter + target summary.
- `PATCH /admin/reports/:id` — `resolve`: `RESOLVED` (note optional) / `REJECTED` (note ≥10 mandatory) → sets resolvedBy/resolvedAt/resolutionNote, `@Audit('REPORT_RESOLVED'|'REPORT_REJECTED','REPORT')`; `ESCALATED` → priority `CRITICAL`, status unchanged, `@Audit('REPORT_ESCALATED','REPORT')`. Side-effect booleans (only meaningful with `RESOLVED`): `suspendTarget` → suspend the *target user* (USER: target; PROPERTY: owner; MESSAGE: sender) via the shared cascade (D5) — user SUSPENDED + tokens revoked + ACTIVE properties PAUSED `pausedReason='OWNER_SUSPENDED'`; `removeListing` (PROPERTY targets only, else 400) → property `DELETED`.

### admin-users/ (`modules/admin-users/`)
- `GET /admin/users` — search (phone/name/email ilike), role/status/date filters, cursor, createdAt desc.
- `GET /admin/users/:id` — detail + stats: propertiesCount (not DELETED), requestsAsTenantCount, reportsAgainst (same definition as priorViolations).
- `PATCH /admin/users/:id/status` `@Audit('USER_SUSPENDED'|'USER_ACTIVATED'|'USER_DELETED','USER')` — reason mandatory (≥10) for SUSPENDED/DELETED. Transitions: ACTIVE↔SUSPENDED, ACTIVE/SUSPENDED→DELETED (one-way; DELETED→* → 409). Self-modification → 409. Cascade (D5 matrix):
  - SUSPENDED/DELETED → user status; `refreshTokens.updateMany({revokedAt: now})` where null; `properties.updateMany({status:'PAUSED', pausedReason:'OWNER_SUSPENDED'})` where `ownerId AND status='ACTIVE'` (RENTED/DRAFT/PENDING stay).
  - ACTIVATE → user ACTIVE; `properties.updateMany({status:'ACTIVE', pausedReason:null})` where `ownerId AND status='PAUSED' AND pausedReason='OWNER_SUSPENDED'` — owner-paused (`pausedReason='OWNER'`) and admin-paused rows stay paused.
- `POST /admin/users/bulk/suspend` `@Audit('USER_BULK_SUSPENDED','USER')` — `{userIds ≤100, reason ≥10}`; per-user atomic (`updateMany` batches inside try/catch per user); already-DELETED → failed entry; already-SUSPENDED → succeeded no-op. Response `{succeeded:[{userId}], failed:[{userId, reason}], counts}` (targetId falls back to adminId).
- Existing owner pause/resume paths (`properties.service.ts` `pause`/`resume`) updated to write `pausedReason: 'OWNER'` / `null`.

### admin-properties/ (`modules/admin-properties/`)
- `GET /admin/properties` — search/type/status/verification/ownerId/regionId/date filters, cursor.
- `GET /admin/properties/:id` — detail + owner summary.
- `PATCH /admin/properties/:id/status` — allowed `PAUSED|REJECTED|ACTIVE|DELETED`; reason mandatory for REJECTED; `@Audit('PROPERTY_PAUSED'|'PROPERTY_REJECTED'|'PROPERTY_RESUMED'|'PROPERTY_DELETED','PROPERTY')`. Transition rules: `PAUSED` from ACTIVE/RENTED (sets `pausedReason='ADMIN'`); `ACTIVE` only from PAUSED (un-pause; blocked with 409 `OWNER_SUSPENDED` if `pausedReason='OWNER_SUSPENDED'` and owner is still SUSPENDED); `REJECTED` from any non-DELETED (sets rejectionReason, emits `property.rejected` with reason); `DELETED` from any. Admin REJECTED re-enters the owner's editable flow via existing owner re-submit path.

## 5. Web (`apps/web/src/app/(admin)/` — 9 pages + shell)

1. `lib/session.ts` — add `requireRole('ADMIN')`: no session → `/login`; role ≠ ADMIN → `/forbidden`.
2. `app/forbidden/page.tsx` — new standalone page ("Ruxsat yo'q" + home link). Does not exist today.
3. `(admin)/layout.tsx` — `requireRole('ADMIN')`; sidebar reusing the generic `components/owner/Sidebar.tsx` with items: Overview `/admin`, Users, Properties, Verification, Reports, Requests, Analytics, Settings. NotificationBell in the header row (owner-layout precedent).
4. `/admin` — KPI cards (`KpiCard` reused), 30d growth chart (recharts 3.10.1, `Sparkline`/chart pattern from owner analytics), recent users + recent properties lists.
5. `/admin/users` — search/filter/table; `components/admin/UserDetailDrawer.tsx` (full record + stats; Suspend/Activate/Delete via `ConfirmModal` with mandatory reason; suspend modal lists side-effects: "N ta faol e'lon to'xtatiladi").
6. `/admin/properties` — filters/table; `PropertyDetailDrawer.tsx`; status actions.
7. `/admin/verification` — queue table (claim badges); `components/admin/VerificationReview.tsx`: gallery (reuse `PropertyGallery`), owner card, map (reuse `PropertyMiniMap`/`LazyMiniMap`), price snapshot, 5-point checklist (checkboxes, session state only), keyboard shortcuts **A**pprove / **R**eject / **I**nfo + arrow-key queue navigation; reject opens mandatory-reason modal.
8. `/admin/reports` — priority chips (LOW/MEDIUM/HIGH/CRITICAL `Badge`); `ReportReview.tsx`: evidence, target preview, resolve/reject/escalate (+ suspendTarget/removeListing toggles in the resolve modal).
9. `/admin/requests` — read-only table with filters.
10. `/admin/analytics` — platform-level charts (users/properties/requests series + `RangeFilter` reused).
11. `/admin/settings` — three tabs: **Feature flags** (GET/PATCH `/admin/flags`, production warning for the two dangerous booleans), **Audit log** (cursor list, filters), **Jobs** (reuses Phase 6 `GET /jobs` — already `@Roles('ADMIN')`; no API change needed).
12. `components/admin/ConfirmModal.tsx` — shared reason-taking modal for all destructive/admin actions. `hooks/use-admin.ts` — TanStack Query hooks, keys `['admin', …]` (new `src/hooks/` dir — does not exist in this branch).
13. `messages/uz.json` — add `admin.*` blocks (sidebar, dashboard, users, properties, verification + `verification.checklist.*` ×5, reports + `reports.reasons.*` ×7, requests, analytics, settings incl. flags/audit/jobs labels + prod warning, audit) + `nav.admin`; notifications: `notifications.types.verificationInfoRequested`, `notifications.bodies.verification.infoRequested`.
14. Navbar/BottomNav ADMIN link — minimal edits (Phase 5 conflict zone): `Navbar.tsx` gets a conditional "Admin" link when `getSession()?.role === 'ADMIN'` (desktop nav); `BottomNav.tsx` becomes session-aware with a conditional 7th item and `grid-cols-7` vs `grid-cols-6`. Keep the diffs tiny and append-only where possible.

## 6. Tests (7_Phase.md §3, expanded by the brief)

**Unit** (`vitest`, colocated `.test.ts`):
- `packages/contracts/src/admin.test.ts`, `reports.test.ts` — RejectReason bounds, evidence ≤5, note-≥10-on-REJECTED refine, FeatureFlagUpdate ranges.
- `reports.service.test.ts` — priority auto-derive matrix; self-report; duplicate-open (mocked prisma).
- `admin-users.service.test.ts` — suspend/activate cascade matrix (assert exact `updateMany` where/data: only ACTIVE→PAUSED on suspend; only OWNER_SUSPENDED-paused→ACTIVE on activate; tokens revoked).
- `audit-log.interceptor.test.ts` — writes a row on annotated routes on success (adminId from JWT sub, targetId from response `data.id`); skips non-annotated routes.
- `feature-flags.service.test.ts` — 5 s cache = single Redis read per window; override beats env; prod hard-false for dangerous flags.
- Extend `notification-i18n.contract.test.ts` bodyKeys with `verification.infoRequested` (the types test auto-covers the new enum via `NOTIF_TYPES`). New `admin-i18n.contract.test.ts`: every `REPORT_REASONS` value has `admin.reports.reasons.<value>`; the 5 `admin.verification.checklist.*` keys exist.

**Integration** (`apps/api/test/admin-moderation.integration.test.ts`, phase-7 stack; boot mirrors phase-6 suite — cookieParser + StandardSchemaValidationPipe + `api/v1` prefix; truncate adds `auditLogs`, `reports`; admin = register → DB role/status flip **before login** (trap 14) → login):
1. pending → claim → approve → ACTIVE + isVerified + verifiedAt/By + audit row + PROPERTY_VERIFIED notification (poll-wait).
2. reject reason <10 → 400; ≥10 → 200 + audit + notification with reason.
3. suspended owner (DB flip) approve → 409 `OWNER_SUSPENDED`, no state change.
4. request-info → status stays PENDING_VERIFICATION + VERIFICATION_INFO_REQUESTED notification + audit row.
5. self-report 400; duplicate open 409; priority derive on create.
6. resolve + suspendTarget → target SUSPENDED + refresh tokens revoked + report RESOLVED.
7. resolve + removeListing → property DELETED.
8. escalate → CRITICAL + audit.
9. bulk suspend 10 (1 pre-DELETED) → 9 succeeded / 1 failed.
10. audit reverse-chrono: 5 mixed actions → 5 rows, DESC.
11. non-admin `/admin/*` → 403; suspended admin → 403.
12. reports throttle 11/h → 429: flip `process.env.DISABLE_THROTTLE='false'` for the case (guard reads it per request), restore after; `redis.flushdb` in truncate clears limiter state.
13. suspend/activate property matrix incl. owner-paused (`pausedReason='OWNER'`) rows surviving activation.
14. admin property status: REJECTED without reason → 400; PAUSED sets `pausedReason='ADMIN'`.
15. flags runtime: PATCH `AUTO_APPROVE_LISTINGS=false` → subsequent `submit` → PENDING_VERIFICATION (no restart); GET reflects override.

**E2E** (`apps/web/e2e/admin-moderation.spec.ts`; **must** follow `pnpm --filter api db:seed` after integration suites — trap 15; seeded admins per D6):
- Two browser contexts: admin1 (`+998901234567`) and admin2 (`ADMIN2_PHONE`), both logged in via BFF password login.
- admin1: `PATCH /admin/flags AUTO_APPROVE_LISTINGS=false` → provision 2 properties (submit → PENDING) → restore `true` → `/admin/verification`: claim both, approve one, reject the other (reason modal, ≥10) → `/admin/settings` Audit tab shows both rows within seconds (poll).
- admin2: `/admin/reports` — escalate a HIGH report (created via API by a provisioned user with reason SCAM) → CRITICAL chip + audit row.
- Non-admin → `/admin` → redirected `/forbidden`.
- Spec restores `AUTO_APPROVE_LISTINGS=true` in a `finally` (other specs' `provisionProperty` depends on it; workers=1 so file order is safe).
- Navbar shows the Admin link for admin1 (bonus assertion).

## 7. Docs (AGENTS.md completion record)

- `context/7_Phase.md`: status section ✅ + notes — TTL→RETENTION name reconciliation (D1), Redis soft-claim for REVIEWING (D4), second seed admin (D6), flags prod hard-guard (D3); fix §1.9 `NOTIFICATIONS_*_TTL_DAYS` → `*_RETENTION_DAYS`; note §1.2 claim semantics.
- `context/0_Phase.md`: one bullet under §2 — runtime flag override layer (`flags:runtime:*`, 5 s cache, prod hard-false for `AUTO_APPROVE_LISTINGS`/`AUTH_OTP_DEV_MODE`), startup assertions unchanged.
- `walkthroughs/2026-09-12-phase-7-admin-moderation.md` — task, files, verification results, limitations, **merge plan**: `feature/phase-5-chat-realtime` → main; rebase `feature/phase-6-notifications-analytics` onto main; rebase `feature/phase-7-admin-moderation` onto the rebased phase-6 (its 8 phase-6 commits are inherited until then — normal). Conflict zones to expect at the 7-rebase: `Navbar.tsx`, `BottomNav.tsx`, `messages/uz.json`, `app.module.ts`, `schema.prisma`, `event-bus.service.ts`, contracts `index.ts`, `.env.example`s.

## 8. Verification order (locked)

`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm --filter api test:integration` → `pnpm --filter api db:seed` → `pnpm build` → `pnpm --filter web test:e2e`.

## Key decisions (resolved; challenge only if wrong)

- **D1 TTL name drift**: contracts + settings page use Phase 6's `NOTIFICATIONS_*_RETENTION_DAYS`; 7_Phase.md updated to match (AGENTS.md: docs reconciled first).
- **D2 `FeatureFlagUpdate`** = `{AUTO_APPROVE_LISTINGS?, AUTH_OTP_DEV_MODE?, CHAT_ATTACHMENT_TTL_DAYS?, NOTIFICATIONS_READ_RETENTION_DAYS?, NOTIFICATIONS_UNREAD_RETENTION_DAYS?}` (RETENTION names; CHAT flag included with lazy env default 30 — the var itself lands with Phase 5's merge).
- **D3 Prod safety**: Redis flag overrides would bypass the env startup assertions — the service hard-returns `false` for the two dangerous flags in production and PATCH refuses `true` (409). Assertions in `env.ts` untouched.
- **D4 REVIEWING claim** is Redis-only (`verification:claim:<id>`, TTL 7d, JSON `{adminId, adminName, at}`) — "soft, audit'siz" per the brief; no PropertyStatus value is added (public status machine stays locked). Queue pagination for REVIEWING filters in memory (MVP volume).
- **D5 Suspend cascade** shared between `admin-users` and `reports.resolve(suspendTarget)` (reports imports AdminUsersModule) — one implementation, matrix-tested.
- **D6 Second seeded admin** (`ADMIN2_PHONE`, default `+998901234568`, same `ADMIN_INITIAL_PASSWORD`, idempotent upsert) — required by the "ikkita admin context" E2E; there is no API to mint admins.
- **D7 Audit targetId fallback** `response.data.id → req.params.id → adminId` (NOT NULL uuid column; SETTINGS/bulk rows self-target the acting admin).

## Out of scope (pre-declared)

AI fraud detection; admin impersonation; admin reading private messages; reports against reviews; revenue KPI ≠ 0 (payments are Phase 2 product). No new MVP tables/features from the 0_Phase.md exclusion list.

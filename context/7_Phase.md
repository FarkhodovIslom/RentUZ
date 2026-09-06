# RentUZ MVP — Phase 7: Admin Verification, Reports, Users, Audit

> Cross-cutting decisions live in `0_Phase.md`. The `auditLogs` and `reports` tables and the `AUTO_APPROVE_LISTINGS` flag were wired in earlier phases. This phase builds the admin surface and the audit interceptor that wraps every admin mutation.

## Goal
An admin can sign in to `/admin`, see the dashboard with platform-wide KPIs, walk through the verification queue (approve / reject with mandatory reason / request more info), moderate reports end-to-end, manage users (suspend, activate, bulk), and manage properties (pause, reject, delete). Every admin action is recorded in `auditLogs` via an interceptor. Suspended users are blocked from mutating actions per §54.

## Scope (spec coverage)
§47 (reports API), §48 (verification API), §49 (admin API), §50 (admin analytics), §57 (admin dashboard), §58 (admin users), §59 (admin properties), §60 (verification), §61 (reports/moderation), §73 (audit logs). The `/admin/requests` and `/admin/settings` pages from §15 are also wired here.

## Out of scope this phase
- AI fraud detection (§82 — Phase 2 product)
- Admin ability to read private messages (not in spec)
- Admin impersonation (not in spec; dangerous, deferred to Phase 2+)
- Reports against reviews (no reviews in MVP)

---

## 1. Tasks (ordered, with paths)

### 1.1 Admin core
1. `apps/api/src/common/guards/admin.guard.ts` — `RoleGuard` extended to require `role === 'ADMIN'` and `status === 'ACTIVE'`.
2. `apps/api/src/common/interceptors/audit-log.interceptor.ts` — global, but only acts on routes decorated with `@Audit('ACTION_NAME')` (or matches the route's `@AuditAction` metadata). On success, inserts a row in `auditLogs` with `{ adminId, action, targetType, targetId, metadata }`. Captures `req.body` (sanitized) and the response `data.id` (if present) for the target id.
3. `apps/api/src/modules/admin/admin.module.ts` — registers the guard + interceptor and the sub-modules below.
4. `apps/api/src/modules/admin/admin.controller.ts` (`/admin`):
   - `GET /admin/analytics` — platform-wide KPIs per §57: total users, active users, total properties, active properties, pending verification, open reports, rental requests in range, revenue (sum of successful `payments`; 0 for MVP since payments ship in Phase 2), growth charts (last 30 d, daily).
5. `apps/api/src/modules/admin/audit.service.ts`:
   - `log({ adminId, action, targetType, targetId, metadata })` — used by the interceptor and by services that have non-HTTP entry points (e.g., the verification job).
   - `list({ action?, adminId?, targetType?, targetId?, cursor, limit })` — for the audit log viewer (`/admin/settings` → "Audit log" tab).

### 1.2 Verification queue (§60)
6. `apps/api/src/modules/verification/verification.service.ts`:
   - `queue({ status, type?, regionId?, cursor, limit })` — list of `PENDING_VERIFICATION` properties with owner card, region, district, submittedAt, image count.
   - `get(id)` — full payload for the review screen: property, all images, owner (id, name, phone, member-since, isPhoneVerified, canListProperties, prior violations count), location on a static map preview, description, price snapshot, **a 5-point checklist** (location matches description; price in range; images clear; owner verifiable; no duplicates). The checklist is stored in the reviewer's session in the web app; nothing extra in the API.
   - `approve(adminId, propertyId)` — sets `status='ACTIVE'`, `isVerified=true`, `verifiedAt=now()`, `verifiedBy=adminId`. Emits `property.verified` notification (Phase 6 listener).
   - `reject(adminId, propertyId, reason)` — `reason` is **mandatory** (min 10 chars). Sets `status='REJECTED'`, `rejectionReason=reason`. Emits `property.rejected` notification.
   - `requestInfo(adminId, propertyId, message)` — sets a sub-status `PENDING_VERIFICATION` (no transition) and emits a `verification.info_requested` notification with the message. The property stays in the queue.
7. `apps/api/src/modules/verification/verification.controller.ts` (`/admin/verification`):
   - `GET /admin/verification?status=PENDING|REVIEWING|APPROVED|REJECTED&type=&regionId=&cursor=&limit=`
   - `GET /admin/verification/:id`
   - `POST /admin/verification/:id/approve` — `@Audit('PROPERTY_APPROVED')`
   - `POST /admin/verification/:id/reject` — `@Audit('PROPERTY_REJECTED')` — body: `{ reason: string }`
   - `POST /admin/verification/:id/request-info` — `@Audit('VERIFICATION_INFO_REQUESTED')` — body: `{ message: string }`
   - `POST /admin/verification/:id/claim` — `status: PENDING → REVIEWING` (admin takes ownership of the row). Not audited beyond a soft log.
8. **Suspended owner check** in `approve`: if owner is SUSPENDED, 409 `OWNER_SUSPENDED` and no state change. (Spec §54.)

### 1.3 Reports / moderation (§61)
9. `apps/api/src/modules/reports/reports.service.ts`:
   - `create({ reporterId, targetType, targetId, reason, description?, evidence? })`:
     - Throttle per `reports` policy (10/h per user)
     - Reason auto-derives priority: `SCAM|FAKE|DUPLICATE` → `HIGH`; `WRONG_PRICE|WRONG_LOCATION` → `MEDIUM`; others → `LOW`. `CRITICAL` is reserved for admin escalation.
     - Reject self-reports (a user reporting their own property → 400 `CANNOT_REPORT_SELF`).
     - Reject duplicates: same `(reporterId, targetType, targetId)` open already → 409 `REPORT_ALREADY_OPEN`.
   - `listForAdmin({ status, priority, targetType, cursor, limit })` — search by reporter, target owner, reason, date range
   - `resolve(adminId, reportId, { action, note })` — `action ∈ { RESOLVED, REJECTED }`; `note` is optional for resolved, **required for rejected** (min 10 chars). The action can also suspend the reporter/target or remove the listing; see §1.4.
   - `escalate(adminId, reportId, priority)` — set to `CRITICAL`.
10. `apps/api/src/modules/reports/reports.controller.ts`:
    - `POST /reports` — public (auth required, throttle, no admin)
    - `GET /admin/reports` — admin
    - `GET /admin/reports/:id` — admin
    - `PATCH /admin/reports/:id` — admin resolve/reject/escalate, `@Audit('REPORT_RESOLVED'|'REPORT_REJECTED'|'REPORT_ESCALATED')`

### 1.4 Admin users (§58)
11. `apps/api/src/modules/admin-users/admin-users.service.ts`:
   - `list({ search, role, status, createdFrom, createdTo, cursor, limit })` — search by phone, name, email; sort by createdAt desc by default
   - `get(userId)` — full user detail with stats (properties count, requests count, reports against this user)
   - `setStatus(adminId, userId, { status, reason })` — `ACTIVE`/`SUSPENDED`/`DELETED`; `reason` mandatory for `SUSPENDED`/`DELETED`. Suspending cascades: revoke all refresh tokens, mark the user's active properties as `PAUSED`. Activating restores them (only the ones that were `PAUSED` due to suspension — others stay in their state).
12. `apps/api/src/modules/admin-users/admin-users.controller.ts`:
    - `GET /admin/users` — list
    - `GET /admin/users/:id` — detail
    - `PATCH /admin/users/:id/status` — body: `{ status, reason? }`, `@Audit('USER_SUSPENDED'|'USER_ACTIVATED'|'USER_DELETED')`
    - `POST /admin/users/bulk/suspend` — body: `{ userIds, reason }`, `@Audit('USER_BULK_SUSPENDED')`. Atomic per user (one failure rolls back that user but others continue, with a per-user status report in the response).

### 1.5 Admin properties (§59)
13. `apps/api/src/modules/admin-properties/admin-properties.service.ts`:
   - `list({ search, type, status, verification, ownerId, regionId, createdFrom, createdTo, cursor, limit })`
   - `setStatus(adminId, propertyId, { status, reason })` — allowed: `PAUSED`, `REJECTED`, `ACTIVE` (un-pause), `DELETED`. `reason` mandatory for REJECTED.
14. `apps/api/src/modules/admin-properties/admin-properties.controller.ts`:
    - `GET /admin/properties` — list
    - `GET /admin/properties/:id` — detail
    - `PATCH /admin/properties/:id/status` — `@Audit('PROPERTY_PAUSED'|'PROPERTY_REJECTED'|'PROPERTY_RESUMED'|'PROPERTY_DELETED')`

### 1.6 Web — admin pages (§15)
15. `apps/web/src/app/(admin)/layout.tsx` — `requireRole('ADMIN')`; admin sidebar (Overview, Users, Properties, Verification, Reports, Requests, Analytics, Settings).
16. `apps/web/src/app/(admin)/admin/page.tsx` — overview dashboard: KPI cards (total/active users, total/active properties, pending verification, open reports, revenue placeholder), a 30-day growth chart, "Recent users" + "Recent properties" lists.
17. `apps/web/src/app/(admin)/admin/users/page.tsx` — search + filter + table; row click → `UserDetailDrawer.tsx` with the full record and "Suspend / Activate / Delete" actions (modal with mandatory reason).
18. `apps/web/src/app/(admin)/admin/properties/page.tsx` — search + filter + table; row click → `PropertyDetailDrawer.tsx`; status actions (pause, reject, delete).
19. `apps/web/src/app/(admin)/admin/verification/page.tsx` — queue table; row click → `VerificationReview.tsx`: full image gallery, owner card, description, map, price snapshot, 5-point checklist, action buttons (Approve / Reject / Request Info / Claim).
20. `apps/web/src/app/(admin)/admin/reports/page.tsx` — list of reports with priority chips; row click → `ReportReview.tsx` with evidence, target preview, resolve/reject/escalate actions.
21. `apps/web/src/app/(admin)/admin/requests/page.tsx` — read-only view of all rental requests (filters by status, property, owner, tenant, date).
22. `apps/web/src/app/(admin)/admin/analytics/page.tsx` — same chart components as the owner analytics page but at the platform level.
23. `apps/web/src/app/(admin)/admin/settings/page.tsx`:
    - Tabs: Feature flags, Audit log, Jobs
    - **Feature flags**: read/write `AUTO_APPROVE_LISTINGS`, `AUTH_OTP_DEV_MODE` (with a "do not enable in production" warning), `CHAT_ATTACHMENT_TTL_DAYS`, `NOTIFICATIONS_*` TTLs
    - **Audit log**: filtered, cursor-paginated list of `auditLogs`
    - **Jobs**: list of BullMQ queues with last 20 runs and next schedule

### 1.7 Admin user experience
24. `apps/web/src/app/(admin)/admin/VerificationReview.tsx` — keyboard shortcuts (A = approve, R = reject, I = info), arrow keys to navigate the queue. Reject opens a mandatory-reason modal.
25. `apps/web/src/components/admin/ConfirmModal.tsx` — reused for any admin action that takes a reason.

### 1.8 i18n keys
`admin.sidebar.*`, `admin.dashboard.*`, `admin.users.*`, `admin.properties.*`, `admin.verification.*`, `admin.verification.checklist.*` (5 items), `admin.reports.*`, `admin.requests.*`, `admin.analytics.*`, `admin.settings.*`, `admin.audit.*`. Reject/Info request reasons are typed by the admin (no i18n).

### 1.9 API contracts
25. Zod in `packages/contracts`:
    ```ts
    export const RejectReason = z.string().min(10).max(500);
    export const RejectBody = z.object({ reason: RejectReason });
    export const SuspendBody = z.object({ status: z.enum(["ACTIVE","SUSPENDED","DELETED"]), reason: RejectReason.optional() });
    export const SetPropertyStatusBody = z.object({ status: z.enum(["ACTIVE","PAUSED","REJECTED","DELETED"]), reason: RejectReason.optional() });
    export const ReportCreateInput = z.object({
      targetType: z.enum([...ReportTarget]),
      targetId: z.string().uuid(),
      reason: z.enum(["FAKE","WRONG_PRICE","WRONG_LOCATION","SCAM","DUPLICATE","INAPPROPRIATE","OTHER"]),
      description: z.string().max(1000).optional(),
      evidence: z.array(z.object({ kind: z.enum(["image","text"]), ref: z.string().max(500) })).max(5).optional(),
    });
    export const ReportResolveBody = z.object({
      action: z.enum(["RESOLVED","REJECTED","ESCALATED"]),
      note: z.string().max(500).optional(),
      suspendTarget: z.boolean().optional(),
      removeListing: z.boolean().optional(),
    });
    export const FeatureFlagUpdate = z.object({
      AUTO_APPROVE_LISTINGS: z.boolean().optional(),
      AUTH_OTP_DEV_MODE: z.boolean().optional(),
      CHAT_ATTACHMENT_TTL_DAYS: z.number().int().min(1).max(365).optional(),
      NOTIFICATIONS_READ_TTL_DAYS: z.number().int().min(1).max(365).optional(),
      NOTIFICATIONS_UNREAD_TTL_DAYS: z.number().int().min(1).max(365).optional(),
    });
    ```

---

## 2. Database changes
- **No new tables.** New migration: `ALTER TYPE report_priority ADD VALUE 'CRITICAL';` (not in Phase 1, added now since `ESCALATED` uses it).
- Add `CREATE INDEX reports_target_idx ON reports ("targetType","targetId","status");` to support the dedup check and the per-target reports list.

---

## 3. Tests

Unit:
- `reportService.create` priority auto-derivation
- `reportService.create` rejects self-reports and duplicates
- `adminUsersService.setStatus` cascade rules (suspend revokes refresh tokens + pauses properties; activate restores only the suspended-paused ones)
- `auditInterceptor` writes a row for every annotated controller, on success
- Suspended user blocked at the service layer from publish/request/message-send (covered in Phase 2/4/5 tests; this phase adds an explicit test for `properties.publish` and `rental_requests.create` against a suspended user)

Integration (PostGIS + Redis):
- Verify queue: pending → reviewing → approved → audit row + notification + property ACTIVE
- Reject with reason <10 chars → 400; with reason ≥10 chars → 200, audit + notification
- Suspended owner trying to approve a property → 409 OWNER_SUSPENDED
- Report open → resolve with `suspendTarget=true` → user SUSPENDED, refresh tokens revoked, report RESOLVED
- Report open → resolve with `removeListing=true` → property DELETED
- Bulk suspend: 10 users, 1 already deleted → response has 9 succeeded + 1 failed with reason
- Audit log: 5 admin actions of different types → 5 rows; list endpoint returns them in reverse chrono order
- Non-admin calling any `/admin/...` → 403

Security:
- Admin A cannot impersonate admin B's actions (audit row uses the JWT subject, not the body)
- Suspended admin cannot access admin routes → 403
- Reports rate-limited to 10/h per user (call 11 → 429)
- A user can report the same target only once while their report is OPEN

Web E2E (Playwright, two admin contexts):
- Admin 1 opens verification queue, claims 2 items, approves one, rejects the other with a reason → both audit rows appear in `/admin/settings` Audit log within seconds
- Admin 1 opens reports, escalates a HIGH report to CRITICAL → priority chip updates, audit row written
- Non-admin user navigating to `/admin` is redirected to `/forbidden`

---

## 4. Definition of Done
- All paths in §1 implemented; lint+typecheck+unit+integration+E2E green
- A 5-minute walkthrough with the seeded admin: open `/admin`, see KPIs, process 1 verification, resolve 1 report, suspend 1 user, observe 5 audit rows in the settings tab
- `AUTO_APPROVE_LISTINGS=false` and `AUTH_OTP_DEV_MODE=false` settable from the settings page; production startup assertion in `8_Phase.md` makes the latter fatal if enabled

## 5. Risks & escape hatches
- **Cascading side effects** — suspending a user pauses properties and revokes tokens. This is non-trivial; tests cover the matrix carefully. If a user owns properties, suspending them is an admin-only op with a clear modal that lists the side-effects ("11 active properties will be paused").
- **Audit log volume** — at 100 admin actions per day, 36k rows/year. Trivial for Postgres. The cleanup job in `6_Phase.md` covers notifications; audit logs are **never** auto-deleted (compliance).
- **Settings page mutations** — feature flags hit process-level env at runtime via a `ConfigService` wrapper that supports a Redis-backed override layer. The override layer is **read on every request** (1 ms), with a 5 s in-process cache. The Redis keyspace is `flags:runtime:*`. No restart needed.
- **Report reason set is fixed** — the spec lists 7 reasons; we use that set exactly. Adding reasons is a schema change (new enum value) and an i18n update.
- **Reactivation side-effects** — activating a user only restores properties that were `PAUSED` *because of* the suspension. We track this with a `properties.pausedReason` column added in a new migration: `'OWNER_SUSPENDED' | 'ADMIN' | 'OWNER'`. On suspension, set to `OWNER_SUSPENDED`; on activation, set to `ACTIVE` only for those rows.

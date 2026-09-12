# Phase 7 — Admin, Verification, Reports, Audit (2026-09-12)

## Task

Implemented `context/7_Phase.md` (§47–§50, §54, §57–§61, §73; §15 `/admin/requests` + `/admin/settings`): the admin core (platform analytics, audit trail, runtime feature flags), the verification queue with a soft Redis claim, reports/moderation with cascades, admin user management with the suspend/activate matrix, admin property status actions, and the 9-page web admin surface. Branch `feature/phase-7-admin-moderation` — **built in a parallel git worktree** (`../RentUZ-phase7`) off `feature/phase-6-notifications-analytics`; local commits only, no push/PR. The Phase 5 working tree (primary repo, uncommitted chat work) was not touched.

## Parallel-dev setup

- `git worktree add ../RentUZ-phase7 -b feature/phase-7-admin-moderation feature/phase-6-notifications-analytics`.
- Isolated stack: `docker-compose.phase7.yml` (compose project `rentuz-phase7`; PostGIS **:5436**, Redis **:6381**, MinIO :9210/9211, own volumes) so the main (:5434) and Phase 6 (:5435) stacks kept running untouched. Dev API :4101 / web :3101; E2E pins its own API :4000 + web :3000 via `playwright.config.ts` webServer env.
- `apps/api/.env` points at 5436/6381/9210 and sets `ADMIN_INITIAL_PASSWORD` + `ADMIN2_PHONE`; `vitest.integration.config.ts` already reads DB/Redis from `apps/api/.env` (Phase 6 change).
- Fresh DB bootstrap: `prisma migrate dev` + **two-step seed** — same pre-existing gap as Phase 6 (the Phase-2 seed rewrite dropped the Phase-1 location seeding, so the current `seed.ts` expects `locations` to pre-exist). Worked around by copying the 14 regions + 64 districts from the Phase-6 DB; `db:seed` then created the 120 listings.

## Key findings (docs vs. reality)

- `reports`/`auditLogs` and the verification columns already existed, but `ReportPriority` had no `CRITICAL`, `NotifType` had no `VERIFICATION_INFO_REQUESTED`, and `properties` had no `pausedReason` — the migration is real work.
- 7_Phase.md §1.9 `NOTIFICATIONS_*_TTL_DAYS` names were **stale**: Phase 6 shipped `NOTIFICATIONS_*_RETENTION_DAYS`. Contracts + settings use the shipped names and the doc was reconciled (AGENTS.md rule).
- `PATCH /admin/reports/:id` needs three *different* audit actions from one route → `@Audit` accepts a body-derived action resolver.
- `auditLogs.targetId` is `NOT NULL uuid`, so routes without an entity id (flags, bulk) need a fallback → `response.data.id → req.params.id → adminId` with `targetType` disambiguating.
- The runtime override layer would otherwise let a Redis flag bypass the boot assertions for `AUTO_APPROVE_LISTINGS`/`AUTH_OTP_DEV_MODE` → both are hard-false in production at read time and `PATCH /admin/flags` refuses `true` there.
- Suspend/activate needed a `pausedReason` discriminator so activation restores *only* suspension-paused listings; the owner pause/resume paths now write `'OWNER'`/`null`.
- E2E "two admin contexts" has no API to mint admins → the seed upserts a second admin (`ADMIN2_PHONE`).
- Integration helpers must switch to the AIO envelope shape `body.data.data` for `{data, meta}` list endpoints.

## Files changed

**API** (`apps/api/src/`)
- `common/guards/admin.guard.ts` — `@Roles('ADMIN')` routes require `role==='ADMIN' && status==='ACTIVE'` from the JWT claim (closes the suspended-admin GET hole `SuspendedGuard` leaves).
- `common/decorators/audit.decorator.ts` + `common/interceptors/audit-log.interceptor.ts` — global, `@Audit(action, targetType)` only; writes `{adminId: JWT sub, action, targetType, targetId, metadata: sanitized body}` awaited inside the response stream.
- `common/services/feature-flags.service.ts` + `feature-flags.module.ts` (`@Global`) — Redis `flags:runtime:*` override + env default + 5 s cache; prod hard-guard; `get/set/all`.
- `common/utils/cursor.ts` — shared cursor parse/encode/meta for admin lists.
- `modules/admin/` — `admin.service.ts` (§57 KPIs + 30-day Tashkent growth series, §15 requests browser), `audit.service.ts` (log + reverse-chrono cursor list), `admin.controller.ts` (`GET analytics|requests|audit|flags`, `PATCH flags`), module.
- `modules/verification/` — queue (PENDING/REVIEWING/APPROVED/REJECTED tabs, Redis claim annotation), `get` (owner card + prior violations), `claim`, `approve` (owner-suspended → 409 `OWNER_SUSPENDED`, emits `property.verified`), `reject`, `requestInfo` (emits `verification.info_requested`), controller, module.
- `modules/reports/` — `reports.service.ts` (create with self-report 400 `CANNOT_REPORT_SELF` + duplicate 409 `REPORT_ALREADY_OPEN` + priority auto-derive; admin list/detail; resolve/reject/escalate with `suspendTarget`/`removeListing` cascades via `AdminUsersService`), controller (`POST /reports` throttled 10/h per user, `/admin/reports*`), module.
- `modules/admin-users/` — list/get/stats, `setStatus` suspend/activate cascade (revoke refresh tokens, pause ACTIVE → `OWNER_SUSPENDED`, restore only those), `bulkSuspend` per-user report, controller (body-derived audit actions), module.
- `modules/admin-properties/` — list/detail, `setStatus` (PAUSED/REJECTED/ACTIVE/DELETED, `pausedReason='ADMIN'`, owner-suspended un-pause blocked, reject emits `property.rejected`), controller, module.
- `common/services/event-bus.service.ts` — `VERIFICATION_INFO_EVENTS` + payload; `modules/notifications/notification-listeners.ts` — `verification.info_requested` → `VERIFICATION_INFO_REQUESTED` (message-hash idempotency key).
- Flag read sites moved to `FeatureFlagsService`: `properties.service.ts` (`submit` + owner pause/resume `pausedReason`), `auth.service.ts` (`issueOtp`), `jobs/notifications-cleanup.processor.ts` (retention days).
- `config/env.ts` — `ADMIN2_PHONE`; `app.module.ts` — FeatureFlagsModule, AdminGuard, AuditLogInterceptor-order, 5 new modules.
- `prisma/schema.prisma` + `prisma/migrations/20260912180000_phase7_admin_moderation/` (CRITICAL, VERIFICATION_INFO_REQUESTED, `pausedReason`, `reports_target_idx`); `prisma/seed.ts` — second admin.
- `test/admin-moderation.integration.test.ts` (new, 16 tests); unit tests: `reports.service.test.ts`, `admin-users.service.test.ts`, `audit-log.interceptor.test.ts`, `feature-flags.service.test.ts`, `admin-i18n.contract.test.ts` (+ updated `notification-i18n.contract.test.ts`).

**Contracts** (`packages/contracts/src/`) — `admin.ts` (RejectReason/RejectBody/SuspendBody/SetPropertyStatusBody/FeatureFlagUpdate/analytics/user/property/verification/audit/requests DTOs), `reports.ts` (7 reasons, `deriveReportPriority`, ReportResolveBody superRefine), `notifications.ts` (8th `NOTIF_TYPES` value), barrel exports, `admin.test.ts` + `reports.test.ts`, updated `notifications.test.ts`.

**Web** (`apps/web/`)
- `app/(admin)/layout.tsx` (server-side admin gate + sidebar + bell) and `app/(admin)/admin/{page,users,properties,verification,reports,requests,analytics,settings}`; `app/forbidden/page.tsx`.
- `components/admin/` — `ConfirmModal` (mandatory/optional reason), `UserDetailDrawer`, `PropertyDetailDrawer`, `VerificationReview` (gallery, owner card, map, 5-point checklist, A/R/I + arrows), `ReportReview` (evidence, resolve/reject/escalate, suspendTarget/removeListing).
- `hooks/use-admin.ts` (TanStack Query hooks), `lib/session.ts` `requireRole()`, `components/nav/Navbar.tsx` + `BottomNav.tsx` (conditional ADMIN link), `messages/uz.json` (`admin.*`, checklist 5, report reasons 7, `notifications.*` additions), `e2e/admin-moderation.spec.ts`.

## Verification

Order run: `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm --filter api test:integration` → `pnpm --filter api db:seed` → `pnpm build` → `pnpm --filter web test:e2e`.

- **Lint** 4/4 packages ✅ · **Typecheck** 5/5 ✅ · **Unit** contracts 65 + API 102 ✅ (incl. both i18n contract tests and the new service/interceptor/flags tests).
- **Integration** `admin-moderation.integration.test.ts` **16/16** on the phase-7 stack (pending→claim→approve incl. audit + notification; reject <10 → 400; suspended-owner 409; request-info; self/duplicate/priority; resolve+suspendTarget tokens revoked; removeListing; escalate; bulk 9/1; property status matrix; suspend/activate cascade; audit reverse-chrono ×5 + JWT-subject; non-admin/suspended-admin 403; 11th report → 429; runtime flag round-trip). Full integration run: 83–84/84 depending on the pre-existing midnight-boundary flake (below).
- **E2E** `admin-moderation.spec.ts` 3/3; full web E2E 14/14.
- **Build** contracts + api + web ✅ (admin routes prerender under `(admin)`).

## Limitations / notes

- **AI fraud detection, admin impersonation, admin reading private messages, reports against reviews** — out of MVP scope (unchanged).
- Revenue KPI is a **0 placeholder** (payments ship in Phase 2 of the product).
- `REVIEWING` queue pagination for the claimed filter is in-memory (MVP queue volume); `APPROVED`/`REJECTED` use keyset cursors.
- Pre-existing integration flakiness unrelated to Phase 7: the phase-6 `notifications-analytics` rollup test can assert `29 !== 30` when run within the Tashkent midnight edge, and rare `TRUNCATE` deadlocks occur under Colima; the Phase 7 suite is green in isolation and in the full run.
- The Phase-1 seed's location data is still not recreated by the current `prisma/seed.ts` (repo gap inherited from Phases 2–6); CI/fresh-local must seed locations first.
- E2E `reuseExistingServer` means a stale API on :4000/:3000 would be reused; ensure those ports are free (or CI) before running.

## Merge plan

Branch is stacked on Phase 6 (its 8 commits are inherited — expected). Merge order when Phase 5 lands:

1. `feature/phase-5-chat-realtime` → `main`.
2. Rebase `feature/phase-6-notifications-analytics` onto `main` (expect conflicts in `app.module.ts`, `schema.prisma`, contracts `index.ts`, `uz.json`, `.env.example`s), verify, merge.
3. Rebase `feature/phase-7-admin-moderation` onto the rebased Phase 6 (conflict zones: `Navbar.tsx`, `BottomNav.tsx`, `messages/uz.json`, `app.module.ts`, `schema.prisma`, `event-bus.service.ts`, contracts `index.ts`, `.env.example`s), re-run the ordered verification matrix, merge.

Phase 7 is deliberately additive to the Phase 5 seam: it does not modify `MESSAGE_EVENTS`/`MessageCreatedPayload`, and the `notification-listeners` change is a new `on('verification.info_requested')` case plus one helper.

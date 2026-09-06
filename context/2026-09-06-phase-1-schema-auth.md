# Phase 1 — Schema, Auth, RBAC, Users, BFF (2026-09-06)

## Task

Implement `context/1_Phase.md`: full Prisma schema + migrations (PostGIS), phone-first
auth with refresh rotation + reuse detection, RBAC guards, users module, the web BFF
proxy + session helpers + 5 auth pages, tests, and the SWC production build path.

Branch: `feature/phase-1-schema-auth` (on `feature/phase-0-foundation`).

## What was built

**Database** — `apps/api/prisma/`:
- Schema with 17 models (users, refreshTokens, phoneVerifications, locations, fxRates,
  properties + 12 more) and 12 enums; `geography(Point,4326)` as `Unsupported` + denormalized
  lat/lng floats; multi-currency `priceUzs BigInt`; `conversations` unique triple +
  `conversationParticipants.lastReadAt`; no payments/subscriptions (MVP scope).
- Migration `20260906112211_auth_core`: 17 tables, `SET search_path = public, extensions;`
  header, raw-SQL GiST index on `location` + partial unique on `"rentalRequests"` WHERE
  status='PENDING' (camelCase table name — Prisma default naming).
- Seed: 14 regions + 64 districts, USD→UZS rate, admin from env (Argon2id).

**API** — `apps/api/src/`:
- `config/env.ts`: full §5 catalog, production assertions (dev secrets, OTP dev mode,
  auto-approve rejected at startup).
- `common/`: password (argon2id), token (access JWT aud `api` + socket ticket aud `socket`),
  cookies util (`rentuz_at`/`rentuz_rt`, httpOnly/Lax/Secure), decorators (Public, Roles,
  Throttle, CurrentUser), guards (JwtAuthGuard, RoleGuard, SuspendedGuard, ThrottleGuard
  on rate-limiter-flexible + ioredis with in-memory insurance limiter).
- `modules/auth/`: 8 endpoints (register, login + Redis lockout, refresh with rotation +
  family-revoke on reuse, logout, verify-phone, resend, forgot, reset-password revoking
  all tokens), SmsSender interface + console driver.
- `modules/users/`: GET/PATCH `/users/me` (safe fields only). Avatar → Phase 2.
- `common/token.module.ts` (@Global TokenService/PasswordService for the global guards).
- `scripts/build.mjs`: SWC ESM build with decorator metadata (compiles generated Prisma
  TS client too) — replaces tsx/nest-cli (both broken, see traps 5).

**Web** — `apps/web/src/`:
- BFF proxy (`app/api/v1/[...path]/route.ts` + `lib/proxy.ts`): cookie pass-through,
  `Domain=` stripping on Set-Cookie, multipart-safe body forward, x-forwarded-for.
- `lib/api.ts` (typed fetch + ApiError), `lib/session.ts` (getSession/requireSession).
- 5 auth pages (RHF 7.87.0 + @hookform/resolvers 5.9.1): login, register, verify-phone
  (60 s cooldown), forgot-password, reset-password; `(tenant)/layout.tsx` with the
  verification banner; favorites placeholder; `@/*` alias; uz.json keys.

**Tests**: 13 api unit (env assertions, argon2, token shapes, rotation/reuse with stub
Prisma, OTP hashing) + 11 integration (supertest vs live PostGIS/Redis: full auth flows,
lockout, RBAC 401/403, passwordHash never leaks, cookie auth) + 7 contracts unit.

**OpenAPI**: `/docs` with 5 auth schemas via native `z.toJSONSchema()` + `$ref` wiring
(`zod-openapi` v6 removed — incompatible API).

## Verification performed (AGENTS.md order)

| Gate | Result |
| --- | --- |
| `pnpm lint` (5 workspaces) | green |
| `pnpm typecheck` | green (0 errors) |
| `pnpm test` (unit) | 20/20 (api 13, contracts 7) |
| `pnpm --filter api test:integration` | 11/11 vs live PostGIS:5434 + Redis:6379 |
| `pnpm build` | api dist via SWC; web pre-renders 12 routes |
| Boot gate (`node dist/main.js`) | `/health` 200, `/ready` 200 (db+redis ok) |
| Curl smoke | register → verify-phone → users/me (Bearer + cookie) → login → refresh (rotates) → reuse → 401 (family revoked); anonymous 401; Zod 400 on bad phone; duplicate phone 409 |
| Swagger | `/docs` 200; `/docs-json` shows 5 DTO schemas + refs on auth paths |

## Environment notes (this machine)

- Colima had to be recreated (`colima delete -f && colima start`) — the old VM was stuck
  with a stale hostagent and empty runtime.
- Postgres moved to host port **5434** (5432/5433 taken by other projects' containers).
- One-time `ALTER USER postgres PASSWORD 'postgres'` was needed inside the fresh container
  (init-script/volume first-boot race).

## Deviations from the plan (all documented in `context/0_Phase.md` §1 traps + `1_Phase.md` §6)

1. tsx/esbuild never emits decorator metadata → API runs from a custom SWC build
   (`scripts/build.mjs`); `@nestjs/cli@12` itself is broken on Node 22.14.
2. Decorator order: `@Controller()` before `@Public()`, or the blanket is invisible.
3. Global `StandardSchemaValidationPipe` required — `@Body({ schema })` alone does not validate.
4. `zod-openapi` dropped in favour of native `z.toJSONSchema()`.
5. `DISABLE_THROTTLE` env for integration tests that exceed real limits (lockout case).
6. Integration test boot must mirror `main.ts` (cookieParser + pipe + prefix).
7. Playwright E2E deferred to Phase 3 (per plan; integration suite covers Phase 1 DoD).

## Remaining limitations / follow-ups

- Avatar upload (Phase 2, with the shared image pipeline).
- Real SMS provider (pre-launch item; console driver + dev OTP only).
- Playwright E2E harness (Phase 3).
- nestjs-pino structured logs (Phase 8 monitoring).
- Redis adapter/websockets (Phase 5).

## Authoritative references

- Plan: [`1_Phase.md`](./1_Phase.md) (§6 outcomes), [`0_Phase.md`](./0_Phase.md) (§1 traps 1–14)
- Spec: `RentUZ-specs.md` §11, §23–§24, §35–§36, §39–§40, §52–§53, §90
- Walkthrough convention: AGENTS.md "Completion record"

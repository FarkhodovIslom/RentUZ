# RentUZ MVP — Phase 0: Foundation, Locked Decisions & Conventions

> This file is the **source of truth** for cross-cutting decisions. Phases 1–8 reference it and never restate it.
> Spec references use `§N` = section number in `RentUZ-specs.md`.

## Phase index

| Phase | File | Scope | Spec |
|---|---|---|---|
| 0 | `0_Phase.md` | Monorepo, versions, conventions, docker, CI, MVP scope | §3–§10, §38, §63, §74, §76–§78, §80, §103 |
| 1 | `1_Phase.md` | Prisma schema, PostGIS, Auth, RBAC, Users, BFF | §11, §23–§24, §35–§36, §39–§40, §52–§53 |
| 2 | `2_Phase.md` | Property CRUD, status machine, images, seed, owner wizard | §19, §32–§33, §41, §51, §85, §94 |
| 3 | `3_Phase.md` | Search, filters, map, details, favorites, home | §12, §17–§22, §42–§43, §63, §93 |
| 4 | `4_Phase.md` | Rental requests, my-rentals, lifecycle jobs | §25–§26, §44, §86 |
| 5 | `5_Phase.md` | Chat, Socket.IO, presence, attachments | §27–§28, §45 |
| 6 | `6_Phase.md` | Notifications, owner dashboard, analytics | §29, §31, §34, §46, §50, §70, §84 |
| 7 | `7_Phase.md` | Admin: verification, reports, users, audit | §47–§49, §54, §57–§61, §73 |
| 8 | `8_Phase.md` | SEO, a11y, security, monitoring, deployment | §7, §53, §68–§72, §75, §79, §91–§100, §103 |

Out of MVP scope (Phase 2 of the product): payments, subscriptions, premium checkout, reviews, saved searches, price alerts, push/email delivery, OAuth (Google/Apple), offline page (needs a service worker), multi-language UI (RU/EN). Tables `reviews`, `subscriptions`, `payments` are **not** created in the MVP schema.

**Guiding principles (§103, applied throughout)**: Simple · Fast · Trustworthy · Secure · Responsive · Scalable · Modern. Every architectural decision in this plan maps to one of these:
- *Simple* — single-module-format ESM monorepo, BFF proxy, no premature abstractions (one geo repository, one search repository, one FX service).
- *Fast* — RSC by default for public pages, lazy-loaded islands, WebP variants, Redis cache on hot paths, GiST + partial indexes, draft images, batched daily rollup.
- *Trustworthy* — Argon2id, refresh-token rotation + reuse detection, RBAC server-side + per-row ownership, audit log on every admin mutation, verified badge tied to backend status, owner verification required for publish.
- *Secure* — httpOnly cookies + CSRF header, helmet + strict CSP, Zod validation at every boundary, SVG rejected, magic-byte checks, rate limits on auth/messages/reports, secrets out of source.
- *Responsive* — mobile-first, bottom nav, sticky CTA on details, 44 px touch targets, dark theme default per §3, no neon/glassmorphism.
- *Scalable* — stateless web, stateless API behind load balancer, Redis adapter for Socket.IO, BullMQ for jobs, PostGIS for geo, connection pooler + direct URL split.
- *Modern* — Next 16, Nest 12, Prisma 7, Tailwind 4, RSC, MapLibre, all dark-mode design system, structured logs, OpenAPI from Zod contracts.

---

## 1. Version pins (verified 2026-09-06 against npm registry)

Install with `pnpm add -E <pkg>@<version>`. **Never install bare `prisma`** — the npm `latest` tag currently points at `8.0.0-rc.13` (verified); we pin the stable `7.10.0`.

| Package | Exact pin | Why / notes |
|---|---|---|
| node | `22.14` (`.nvmrc`) | Satisfies Prisma 7 (`^20.19 \|\|^22.12\|\|>=24`), Nest 12, Next 16 floors |
| typescript | `6.0.2` | `latest` = 7.0.2 (verified) — TS7 is the Go port with **no JS API**; breaks typescript-eslint. TS6 defaults: `strict` on, `moduleResolution: node10` removed, `baseUrl` unsupported, `types` defaults `[]` — see §6 config notes |
| typescript-eslint | `8.69.0` | Last line compatible with TS6 API |
| next | `16.3.4` | Verified. Turbopack default; `proxy.ts` replaces `middleware.ts` (we ship neither); `params`/`searchParams`/`cookies()` are async |
| react / react-dom | `19.2.8` | |
| @nestjs/* (common, core, platform-express, jwt, config, swagger, websockets, platform-socket.io) | `12.0.1` | Verified. Native Standard Schema validation; ESM-ready |
| @nestjs/bullmq | `12.0.0` | Nest 12 compatible |
| prisma / @prisma/client | `7.10.0` | Prisma 7: `prisma-client` generator, `prisma.config.ts`, ESM-first. 8.x is RC — do not use |
| zod | `4.5.4` | Shared contracts; feeds Nest 12 Standard Schema pipe + RHF resolvers |
| tailwindcss | `4.3.3` | CSS-first `@theme` in `globals.css`; no `tailwind.config.js` |
| @tanstack/react-query | `5.102.8` | Server state |
| zustand | `5.0.15` | Client UI state only |
| react-hook-form | `7.87.0` | All forms |
| socket.io / @socket.io/redis-adapter | `4.8.3` / `8.3.0` | Chat realtime |
| maplibre-gl + @vis.gl/react-maplibre | `6.7.0` | Native GeoJSON source clustering — no supercluster |
| next-intl | `4.14.2` | uz-only, **no locale prefix routing**; provider + `getMessages` only, no middleware |
| rate-limiter-flexible | `11.2.0` | Replaces `@nestjs/throttler` (peer range stops at Nest 11 — verified in prior session) |
| argon2 | `0.45.1` | Password hashing (Argon2id) |
| sharp | `0.35.4` | Image pipeline |
| bullmq / ioredis | `6.3.4` / `6.0.0` | Jobs + Redis client |
| nestjs-pino / pino / pino-http | `5.1.0` / `10.3.1` / `11.0.0` | JSON logs (nestjs-pino supports Nest 12) |
| helmet | `8.3.0` | |
| @aws-sdk/client-s3 + s3-request-presigned | latest stable at install | Pin exact and record here |
| @hookform/resolvers | `5.9.1` | Pinned in Phase 1 (with react-hook-form `7.87.0`) |
| @nestjs/config | `12.0.0` | Standard Schema validation of env |
| @nestjs/jwt | `12.0.1` | Peers include Nest 12 (verified) |
| argon2 | `0.45.1` | Argon2id password hashing |
| cookie-parser | `1.4.7` | `@nestjs/cookie-parser` does NOT exist (404) — plain express middleware |
| rate-limiter-flexible | `11.2.0` | Replaces @nestjs/throttler (trap 2) |
| @swc/core | `1.16.2` | Custom build script (trap 5) — `@nestjs/cli@12` itself is broken on Node 22.14 |
| dotenv | `17.2.3` | prisma.config.ts CLI env loading |
| supertest / @types/supertest | `7.1.4` / `6.0.3` | Integration tests |
| recharts | `3.10.1` | Owner/admin analytics charts |
| date-fns / tz handling | `4.4.0` + `@date-fns/tz` | UTC storage, Asia/Tashkent display |
| turbo | `2.10.12` | Monorepo tasks |
| vitest | `4.1.11` | 5.0.0 too fresh; upgrade later deliberately |
| playwright | `1.63.0` | E2E + a11y (axe) |
| tailwind-merge / clsx | `3.6.0` / latest | UI package utils |

### Compatibility traps (verified; workarounds are locked)

1. **`nestjs-zod` is NOT used** — its peer range stops at Nest 11. Nest 12 native Standard Schema works: `@Body({ schema: zodSchema })` + a **global `StandardSchemaValidationPipe`** registered in `main.ts` (`app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }))`). Without the global pipe the schema metadata is ignored (requests pass through unvalidated) — verified in Phase 1 integration tests. OpenAPI: `@nestjs/swagger@12` does NOT surface Standard Schema request bodies through `createDocument`; **resolution (Phase 1)**: register DTOs into `components.schemas` via **Zod 4's native `z.toJSONSchema(schema)`** (no `zod-openapi` dependency — its v6 API no longer exports `extendsZodWithOpenApi` and requires a registry), then wire `$ref`s onto the auth path `requestBody`s. See `apps/api/src/main.ts`.
2. **`@nestjs/throttler` is NOT used** — peer range stops at Nest 11. Custom `ThrottleGuard` on `rate-limiter-flexible` + `ioredis` (gives distributed limiting across instances, which we need anyway). `@Throttle({ key, points, duration })` decorator metadata; `DISABLE_THROTTLE=true` disables it for integration tests that legitimately exceed limits (e.g. the 10-failed-logins lockout case).
3. **Prisma + PostGIS**: `geography(Point,4326)` is `@db.Unsupported(...)` in Prisma — all geo reads/writes/queries are **raw SQL**, contained in `apps/api/src/modules/properties/geo.repository.ts` and `search.repository.ts` only. **Migration caveat (Phase 1, locked)**: PostGIS types live in the `extensions` schema; the migration connection does NOT inherit the URL `search_path`, so every hand-written migration that touches geo types must start with `SET search_path = public, extensions;` (see `20260906112211_auth_core/migration.sql`). Prisma also names tables **camelCase** (`"rentalRequests"`, not snake_case) — raw SQL in migrations must match.
4. **Prisma 7 driver adapter (Phase 0 outcome, **locked**)**: Prisma 7 removed `url = env(...)` from `schema.prisma`. Migrations go through `DATABASE_DIRECT_URL` in `prisma.config.ts`; runtime uses `@prisma/adapter-pg` with `DATABASE_URL`. Code:
   ```ts
   // apps/api/src/prisma/prisma.service.ts
   super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
   ```
   `prisma.config.ts` must `import 'dotenv/config'` itself — the Prisma 7 CLI does not load `.env` files. Local dev db is on **host port 5434** (5432/5433 are taken by other projects on this machine).
5. **Nest 12 ESM DI metadata trap (Phase 0→1 outcome, **resolved in Phase 1**) — `tsx` is NOT a viable runtime**: tsx (esbuild) never emits decorator metadata, so constructor injection silently gets `undefined` (fails even a minimal 2-provider Nest module). `@nestjs/cli@12` is also broken on Node 22.14 (`ERR_REQUIRE_CYCLE_MODULE` in ora/@angular-devkit). **The API runs from a custom SWC build**: `apps/api/scripts/build.mjs` compiles `src/` + the generated Prisma client (Prisma 7 emits TS!) to ESM `dist/` with `legacyDecorator + decoratorMetadata`. Scripts: `build = prisma generate && node scripts/build.mjs`, `start = node dist/main.js`, `dev = node scripts/build.mjs && node --watch dist/main.js`. `tsc` is typecheck-only. **DI value-imports**: every constructor-injected class must be a VALUE import (`import { PrismaService }`), never `import type` — the api eslint config disables `consistent-type-imports` for exactly this reason. Type-only companions for decorated signatures use the `import type { X }` sibling-import pattern.
6. **Nest decorator ORDER matters**: `@Controller()` (and `@Injectable()`-adjacent class decorators like `@Public()`) must be applied AFTER custom metadata decorators — i.e. `@ApiTags` → `@Controller()` → `@Public()`, otherwise class-level `@Public()` is invisible to `Reflector.getAllAndOverride` and public routes return 401 (verified: `/health` was locked out until reordered).
7. **Supabase pooling**: migrations use the **direct** URL (port 5432); runtime uses the **pooler** URL (port 6543, `pgbouncer=true`) so prepared statements are disabled on the pooled path.
8. **Vercel cannot proxy WebSockets** — browser connects to the API origin directly for chat, authenticated by a 60 s single-use socket ticket (Phase 5).
9. **ioredis 6 named export** — `import { Redis } from 'ioredis'`, not the older `import Redis from 'ioredis'` default import.
10. **TS 6 + `module: nodenext` in `extends`-chain tsconfigs** — Prisma's CLI does not resolve workspace `exports`-based extends. All tsconfigs use a **relative path** in `extends` (`../../packages/config/...`). The `eslint.base` config continues to use `@rentuz/config/eslint.base` (ESLint resolves `exports` correctly).
11. **TS 6 + `module: nodenext` workspace imports** — every consuming package (api, web, ui, contracts) needs `@rentuz/config` as a devDependency, otherwise pnpm's strict resolution fails the eslint config import.
12. **Zod `z.coerce.date()` (and any Date-typed schema) crashes @nestjs/swagger at boot** (Phase 4 outcome): the StandardSchema→OpenAPI converter calls Zod 4's `to-json-schema`, which throws `Date cannot be represented in JSON Schema`. Any schema passed to `@Body`/`@Query` pipes must keep dates as **strings** (regex/datetime-validated) and convert to `Date` in the service. Output DTOs are safe (they never go through the pipe). See `packages/contracts/src/rental-requests.ts` `CreateRentalRequestInput.startDate`.
13. **Prisma 7 + partial unique indexes: `P2002` meta shape** (Phase 4 outcome): a violation surfaces as `PrismaClientKnownRequestError` code `P2002`, but `meta.constraint` is **not** set — the constraint name is nested at `meta.driverAdapterError.cause.originalMessage` (e.g. `duplicate key value violates unique constraint "rental_requests_pending_uniq"`). Match on that string when translating to a domain 409. Also: Prisma 7's interactive `$transaction` has a **5 s default timeout** — raise it (`{ timeout: 10_000 }`) for `FOR UPDATE` lock chains.
14. **`GlobalExceptionFilter` code passthrough** (fixed in Phase 4; affected Phase 2/3 endpoints too): Nest `HttpException`s constructed as `new ConflictException({ code: 'X' })` previously had their domain code **squashed** to the status-based default (`CONFLICT`), so clients/tests could never see `DUPLICATE_PENDING_REQUEST` etc. The filter now reads `getResponse().code` first. Guards' `ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' })` benefits too. Trap: role/status checks live in the **JWT payload**, not the DB — flip a user's role/status **before** login in tests, or the guard sees the stale claim.
15. **E2E + seed interplay** (Phase 4 outcome): the integration suites `TRUNCATE ... "users" CASCADE` wipes the 120-property seed (properties cascade from users), so `pnpm --filter web test:e2e` (which relies on seeded ACTIVE listings for `firstActiveSlug`) must be preceded by `pnpm --filter api db:seed` whenever integration tests ran since the last seed. CI does this implicitly (fresh services + seed step). Local: reseed between the two suites.
12. **Zod enums referenced from tests** — schemas (`errorCodeSchema`, `domainErrorCodeSchema`) must be exported from the same file as the const arrays they wrap, or the consuming test file imports break.
13. **Test apps must mirror `main.ts`** — integration boots (`NestFactory.create` in tests) must re-apply `cookieParser()` + `StandardSchemaValidationPipe` + `setGlobalPrefix('api/v1', ...)`, or refresh-cookie tests 401 and validation tests see unvalidated bodies.
14. **No `next lint`** in Next 16 — ESLint flat config lives in `apps/web/eslint.config.mjs` and `pnpm lint` invokes it directly.

---

## 2. Locked architecture decisions

- **Hosting**: Vercel (web) · Render (API + Redis, **paid Starter** — free tier sleeps) · Supabase (Postgres + PostGIS + Storage) · MinIO only in local docker-compose.
- **Monorepo / ESM**: pnpm workspaces + Turborepo; `"type": "module"` in every package; Prisma generator `moduleFormat = "esm"`, TS `module: "nodenext"`. Phase 0 includes an **ESM boot gate** (API boots, DI + decorators + Prisma client load). Documented fallback: switch API to CJS (`moduleFormat = "cjs"` in the Prisma generator, `esModuleInterop` path) — decision point is Phase 0, not later.
- **Auth transport — BFF**: the browser never calls the Nest API directly over REST. Next route handler `apps/web/src/app/api/v1/[...path]/route.ts` proxies method/headers/cookies/body to `INTERNAL_API_URL`, copies response headers back, **strips the `Domain` attribute** from `Set-Cookie` (host-only cookies on the Vercel domain), forwards `x-forwarded-for` and `accept-language`. Access JWT: 15 min. Refresh token: 30 d opaque random, SHA-256-hashed in DB, rotation on every refresh + **reuse detection** (presenting a revoked token revokes the whole token family). Cookies: `httpOnly`, `Secure` in prod, `SameSite=Lax`, `Path=/`.
- **WebSocket auth**: `POST /api/v1/realtime/ticket` (via BFF, cookie-authenticated) returns a 60 s single-use JWT; client opens `io(NEXT_PUBLIC_SOCKET_URL, { auth: { ticket } })` directly to the API. Gateway validates, marks consumed in Redis, joins the user room.
- **Roles / RBAC**: `role: USER | ADMIN` plus capability `canListProperties` (set when phone becomes verified). Suspended users are blocked from publish/request/message-send at the service layer (§54). Guards verify role; **ownership is checked in services, per row** (§90).
- **Phone-first auth**: E.164 `+998XXXXXXXXX` unique phone (required), email unique nullable. OTP codes hashed, 5 min TTL, max 5 attempts. `SmsSender` interface; `console` driver in dev (`AUTH_OTP_DEV_MODE=true` returns the code in the response — **asserted false in production at startup**). Real provider (Eskiz / Play Mobile) is a pre-launch item.
- **Currency**: `price Decimal(14,2)` + `currency: UZS|USD` + normalized `priceUzs BigInt` — **all filtering and sorting use `priceUzs`**. Daily FX job fetches CBU rates into `fx_rates`, backfills `priceUzs` for USD listings. CBU endpoint must be re-verified at implementation; keep last-known rate on failure.
- **Geo**: PostGIS in the `extensions` schema (Supabase convention) **created inside the first migration** (so the Prisma shadow DB gets it), `search_path=public,extensions` on the connection URL in every environment; `lat`/`lng` floats are denormalized next to `location` for typed Prisma reads. Radius: `ST_DWithin`; map viewport: `ST_MakeEnvelope &&` bbox operator.
- **Property lifecycle** (§33, §85): `DRAFT → PENDING_VERIFICATION → ACTIVE → PAUSED/RENTED`, `PENDING_VERIFICATION → REJECTED (reason mandatory)`, anything → `DELETED`. `AUTO_APPROVE_LISTINGS` env flag skips verification in dev; **startup asserts it is `false` in production**. Public search returns `ACTIVE` only (RENTED disappears from search).
- **Search**: one raw SQL query returns matching **IDs + total count** (typed, parameterized); hydration via Prisma `findMany({ where: { id: { in } } })`, re-sorted application-side. Map endpoint returns a lean projection only (`id, title, price, priceUzs, currency, lat, lng, type, mainImage`) per §93.
- **Chat model**: `conversations` unique on `(propertyId, tenantId, ownerId)`; read state = `conversation_participants.lastReadAt` (replaces spec's `messages.readBy` jsonb — unread count is a simple comparison); last message denormalized on the conversation row (`lastMessageAt`, `lastMessagePreview`) — avoids the circular `lastMessageId` FK.
- **Images**: draft-first wizard — the property row is created at step 1, images attach to it. Validation: magic bytes + MIME (JPEG/PNG/WebP), SVG rejected, ≤15 images/property, ≤10 MB each, min 640×480. Processing: EXIF strip → WebP variants `400w / 800w / 1600w`. Storage: **public bucket** for property images, **private bucket + signed URLs** for chat attachments. Nightly orphan job reconciles bucket keys vs DB.
- **URLs / SEO**: `/property/[slug]` where `slug = translit(title)-city-shortid`; old UUID URLs 301-redirect. Search/filter state lives in **URL query params** (§63), never in component state alone.
- **Frontend rendering split**: public/SEO pages (home, rentals, details, map) = RSC with client islands (filters, map, gallery, favorite button); authenticated surfaces (owner, admin, chat, profile) = client components + TanStack Query. Zustand only for UI state (modals, drawers, filter drawer).
- **i18n**: next-intl, Uzbek only, all static UI text behind keys (`home.hero.title`, …) from day 1 (§83); no locale segment in routes.
- **Time**: store UTC, display Asia/Tashkent. Notification grouping "Bugun / Kecha / Oldin" (§29) uses the Tashkent day boundary.
- **Timezone of jobs**: all nightly BullMQ jobs scheduled in cron with Tashkent-appropriate offsets (UTC+5).

---

## 3. Repository layout

```text
rentuz/
├── apps/
│   ├── web/                     # Next.js 16 (App Router)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (public)/    # /, /rentals, /map, /property/[slug]
│   │       │   ├── (auth)/      # /login, /register, /forgot-password, /reset-password
│   │       │   ├── (tenant)/    # /favorites, /chat, /notifications, /profile, /my-rentals, /rental-requests
│   │       │   ├── (owner)/     # /owner/**
│   │       │   ├── (admin)/     # /admin/**
│   │       │   └── api/v1/[...path]/route.ts   # BFF proxy
│   │       ├── components/      # feature components
│   │       ├── lib/             # api client (fetch wrapper), socket client, utils
│   │       ├── stores/          # zustand
│   │       └── messages/uz.json # next-intl
│   └── api/                     # NestJS 12
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── common/          # envelope interceptor, exception filter, guards, decorators, pipes
│           ├── config/          # env validation (Zod via @nestjs/config v12)
│           ├── prisma/          # PrismaModule + client
│           ├── redis/           # ioredis module
│           ├── storage/         # StorageService (S3-compatible)
│           ├── sms/             # SmsSender interface + console driver
│           └── modules/
│               ├── auth/  users/  properties/  search/  favorites/
│               ├── rental-requests/  conversations/  realtime/
│               ├── notifications/  analytics/  reports/  admin/  verification/
│               └── jobs/         # bullmq processors + schedules
├── packages/
│   ├── contracts/               # Zod schemas: envelope, pagination, error codes, all API DTOs
│   ├── ui/                      # design tokens (§3), primitives: Button, Input, Modal, Drawer, Badge, Skeleton, EmptyState...
│   └── config/                  # tsconfig bases, eslint flat config, prettier
├── context/                     # these phase docs
├── docker-compose.yml
├── .github/workflows/ci.yml
├── .nvmrc                       # 22.14
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Global API conventions

- Base path `/api/v1` (§38). Success envelope `{ success: true, data, message: "OK", meta? }`; error envelope `{ success: false, message, error: { code } }` (§91). Implemented once: `ResponseEnvelopeInterceptor` + `GlobalExceptionFilter` in `apps/api/src/common/`.
- Error codes enum in `packages/contracts`: `UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT, RATE_LIMITED, INTERNAL_ERROR` + domain codes (`PROPERTY_NOT_FOUND`, `DUPLICATE_PENDING_REQUEST`, `INSUFFICIENT_PERMISSIONS`, …).
- Pagination: `page` (default 1), `limit` (default 20, **max 100 — enforced server-side**) (§92). `meta: { page, limit, total, totalPages }`. Offset pagination for MVP; keyset is a documented upgrade path for /rentals if needed.
- Rate limits (Redis-backed, env-tunable defaults; §98): login 5/min per IP+phone + account lockout after 10 fails/15 min · register 5/h per IP · OTP send 3/15 min per phone · OTP verify 5/15 min per phone · forgot-password 3/h per IP+phone · reports 10/h per user · messages 30/min per user · global default 100/min per user/IP.
- Logging (§71): pino JSON — `requestId` (uuid, also emitted as `x-request-id` response header), timestamp, endpoint, status, durationMs, userId when authenticated, error stack. `LOG_LEVEL` env.
- Health: `GET /health` (liveness — process up), `GET /ready` (readiness — DB `SELECT 1`, Redis `PING`, storage HEAD bucket) (§72).
- Swagger at `/docs` in non-production (`@nestjs/swagger`, OpenAPI from Zod contracts via the Phase 0 spike).
- Helmet enabled; CORS allowlist from `CORS_ORIGINS` (web origins + localhost in dev), `credentials: true`.

---

## 5. Environment variables (complete catalog — `.env.example` in repo root)

**API** (`apps/api/.env`):
```text
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rentuz?schema=public&search_path=public,extensions   # pooled in prod
DATABASE_DIRECT_URL=postgresql://postgres:postgres@localhost:5432/rentuz                                        # migrations (direct)
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL=30d
SOCKET_TICKET_SECRET=change-me
COOKIE_SECURE=false
CORS_ORIGINS=http://localhost:3000
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_BUCKET_PUBLIC=rentuz-public
STORAGE_BUCKET_PRIVATE=rentuz-private
PUBLIC_STORAGE_BASE_URL=http://localhost:9000/rentuz-public
SMS_PROVIDER=console
AUTH_OTP_DEV_MODE=true          # returns OTP in response; startup-asserted false when NODE_ENV=production
AUTO_APPROVE_LISTINGS=true      # dev convenience; startup-asserted false when NODE_ENV=production
FX_RATES_URL=https://cbu.uz/oz/arkhiv-kursov-valyut/json/
LOG_LEVEL=debug
SENTRY_DSN=
ADMIN_PHONE=+998901234567       # seed only
ADMIN_INITIAL_PASSWORD=         # seed only
```

**Web** (`apps/web/.env`):
```text
INTERNAL_API_URL=http://localhost:4000            # BFF → API, server-side only
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000      # direct WS origin
NEXT_PUBLIC_MAP_TILES_URL=                        # dev: OSM raster demo; prod: MapTiler style URL (pre-launch key)
NEXT_PUBLIC_SENTRY_DSN=
```

Secrets never committed (§74). CI and hosts read from GitHub/Vercel/Render secret stores.

---

## 6. Tooling configuration notes

- **TypeScript 6**: base `packages/config/tsconfig.base.json` with `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"strict": true` (default), **no `baseUrl`** (paths are root-relative), `"types": ["node"]` where needed, `"verbatimModuleSyntax": true`. Next and API extend the base and only override entry/output options.
- **ESLint 9** flat config in `packages/config/eslint.base.js` shared by all workspaces (Next's `next lint` is gone in 16 — plain ESLint only).
- **Tailwind 4**: tokens as CSS custom properties in `apps/web/src/app/globals.css` under `@theme` — colors from §3 (`--color-bg: #080808`, `--color-card: #121212`, `--color-primary: #FFA31A`, `--color-primary-hover: #E88900`, success/error/info, …), spacing on the 8px scale, radii `12–18px`. Same tokens re-exported by `packages/ui` for class helpers. `packages/ui` components live in the web app via vendored shadcn-style primitives (no separate build step — direct source imports through the workspace).
- **Prisma 7**: `prisma.config.ts` at `apps/api` holds the datasource URL (from `DATABASE_DIRECT_URL` for CLI). Generator block in `schema.prisma`:
  ```prisma
  generator client {
    provider            = "prisma-client"
    output              = "./src/generated/prisma"
    runtime             = "nodejs"
    moduleFormat        = "esm"
    importFileExtension = "js"
  }
  ```
  `src/generated/` is gitignored.
- **Turborepo** tasks: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed` with correct `dependsOn` graph.

---

## 7. Local docker-compose

`docker-compose.yml` services:
- `db`: `postgis/postgis:17-3.5`, port 5432, `POSTGRES_DB=rentuz`, named volume.
- `redis`: `redis:7-alpine`, port 6379.
- `minio`: `minio/minio`, ports 9000/9001, named volume.
- `minio-init` (one-shot): `minio/mc` — creates `rentuz-public` (public read) and `rentuz-private` buckets.

The `db` init script creates the `extensions` schema up front (`CREATE SCHEMA IF NOT EXISTS extensions;`) so the first migration only does `CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;` — identical shape to Supabase.

## 8. CI (GitHub Actions, `.github/workflows/ci.yml`)

On PR + push to `main` (§77): `pnpm install` (cached) → `turbo lint` → `turbo typecheck` → `turbo test` (unit) → `turbo test:integration` (services: `postgis/postgis:17-3.5` + `redis:7`; run Prisma migrate against it first) → `turbo build` → Playwright E2E on PRs to `main` (builds web+api, boots compose stack, seeds, runs spec §79 flow). Deploy jobs are added in Phase 8. Git workflow per §78: `main` + `feature/*`, PR + green CI required.

---

## 9. Phase 0 task list

1. `git checkout -b feature/phase-0-foundation` (§78 workflow from the first commit).
2. Scaffold workspace: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `docker-compose.yml`, `.editorconfig`.
3. `packages/config`: `tsconfig.base.json`, `eslint.base.js`, `pretttier.base.json`.
4. `packages/contracts`: `envelope.ts`, `pagination.ts`, `error-codes.ts` (Zod). Stub DTO files per module are added by later phases.
5. `packages/ui`: tokens CSS + primitives `Button, Input, Badge, Skeleton, EmptyState` (enough for Phase 1 pages; the rest land with their phases).
6. `apps/api` (Nest 12, ESM): bootstrap, `ConfigModule` with Zod-validated env, PrismaModule (empty schema, first migration = extensions schema + PostGIS), RedisModule, pino logging, envelope interceptor + exception filter, Helmet, CORS, `/health` + `/ready`, Swagger stub. **ESM boot gate**: app starts, DI works, Prisma client imports — if this fails, switch to the documented CJS fallback now.
7. **Spike**: Zod contract → OpenAPI via `@nestjs/swagger@12` `standardSchemaConverter`. Record result in this file; if unsupported, wire `zod-openapi` manual registration as the fallback.
8. `apps/web` (Next 16): App Router shell with route groups (`(public)`, `(auth)`, …), `globals.css` with §3 tokens, next-intl provider + `messages/uz.json` skeleton, root layout (dark background, Inter font), placeholder home page, `next.config.ts`.
9. `.env.example` files (§5 catalog), `README.md` (setup: `pnpm i`, `docker compose up -d`, `pnpm db:migrate`, `pnpm dev`).
10. CI workflow file; verify it green on a draft PR.

**Definition of Done (Phase 0)**: `docker compose up -d && pnpm install && pnpm dev` starts API (`:4000/health` → `{"success":true}`) and web (`:3000` renders dark shell in uz); `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass; CI green; spike result recorded; exact versions of resolve-at-install packages appended to the table in §1.

**Phase 0 outcomes (verified 2026-09-06; superseded by Phase 1 where noted)**: all 11 unit tests pass, `pnpm lint` and `pnpm typecheck` are green across the workspace, `pnpm --filter web build` pre-renders 6 static routes, and the API boot answered `GET :4000/health → 200` and `GET :4000/ready → 503` (the latter is correct: db/redis are down without docker). Two Phase 0 decisions were reversed in Phase 1 and the traps above are updated accordingly: the API runtime moved from `tsx` to a **custom SWC build** (`scripts/build.mjs` — tsx never emits decorator metadata), and `nestjs-pino` stays deferred in favour of Nest's built-in `Logger`.

**Spike — Zod→OpenAPI (`@nestjs/swagger@12.0.1`)** ❌: the `standardSchemaConverter` hook exists internally on `SwaggerExplorer` but is **not** passed through `SwaggerModule.createDocument(app, config, options)` — only `SwaggerDocumentOptions` is accepted, and the explorer instantiates its own converter. **Phase 1 must use the documented fallback** from §1 trap #1: manual `zod-openapi` (or `@hono/zod-openapi`) registration, called in `main.ts` after `SwaggerModule.createDocument` to mutate the `paths` and `components.schemas` of the document. This is concrete work, not a future risk.

**Risks / escape hatches**: Nest 12 community-gap widening → fall back to Nest `11.2.3` + `@nestjs/throttler` + `nestjs-zod` (decision deadline: end of Phase 0) · ESM/DI friction → CJS fallback documented above · Supabase PostGIS schema drift → `extensions` schema + `search_path` enforced in every env from day one.

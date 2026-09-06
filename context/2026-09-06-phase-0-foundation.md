# Phase 0 — Monorepo Foundation (2026-09-06)

## Task

Implement `context/0_Phase.md`: pnpm + Turborepo ESM monorepo scaffold with
`packages/config`, `packages/contracts`, `packages/ui`, `apps/api` (Nest 12),
`apps/web` (Next 16), docker-compose for local infra, GitHub Actions CI, and the
Phase 0 boot/verification gates.

## What was built

- **Root**: `package.json` (pnpm 9.15, engines `>=22.12`), `pnpm-workspace.yaml`,
  `turbo.json`, `.nvmrc` (22.14), `.editorconfig`, `.prettierrc.json`, `.gitignore`.
- **`packages/config`**: `tsconfig.base.json` (TS 6.0.2, `nodenext`, strict) +
  `eslint.base.js` (ESLint 9 flat, typescript-eslint 8.69.0).
- **`packages/contracts`**: Zod 4.5.4 — `envelope.ts` (§38/§91 shapes),
  `pagination.ts` (§92: default 20, hard cap 100), `error-codes.ts` (common +
  domain codes), compiled to `dist/`, 7 unit tests.
- **`packages/ui`**: Tailwind 4 `@theme` tokens from spec §3 (dark palette,
  yellow accent, radii 12–18px, Inter) + primitives: `Button` (44px md target,
  loading state), `Input` (label/error wiring for a11y), `Badge`, `Skeleton`,
  `EmptyState` (action required per §66). Consumed as TS source via
  `transpilePackages`.
- **`apps/api`** (Nest 12.0.1, ESM): Zod-validated env (`config/env.ts`),
  `PrismaService` on the Prisma 7 pg driver adapter, `RedisModule` (ioredis 6,
  error-listener guard), `ResponseEnvelopeInterceptor`, `GlobalExceptionFilter`
  (§91 envelope + requestId), `HealthController` (`/health` liveness, `/ready`
  readiness with 1.5s per-dependency timeouts), helmet, CORS allowlist, global
  prefix `/api/v1`, Swagger at `/docs` (non-prod). Prisma schema: datasource +
  `prisma-client` generator only (models are Phase 1); first migration creates
  the `extensions` schema + PostGIS/pgcrypto/citext so the shadow DB gets them.
- **`apps/web`** (Next 16.3.4): App Router with `(public)`/`(auth)` groups, dark
  root layout with Inter, next-intl uz-only (`src/i18n/request.ts`,
  `messages/uz.json`), home page (hero, search form, 7 quick chips, 4 trust
  cards), `Navbar` + mobile `BottomNav` (§6, 5 items), placeholders for
  `/rentals`, `/map`, `/login`, custom `not-found`.
- **Infra**: `docker-compose.yml` — `postgis/postgis:17-3.5`, `redis:7-alpine`,
  MinIO + `minio-init` (creates `rentuz-public`/`rentuz-private` buckets), pg
  init script pre-creates the `extensions` schema.
- **CI**: `.github/workflows/ci.yml` — install → lint → typecheck → test → build
  (§77 order; integration/E2E jobs land with Phases 1–3 per plan).

## Verification performed

| Gate (per `context/0_Phase.md` §9 DoD) | Result |
| --- | --- |
| `pnpm install` | 477 pkgs, lockfile committed |
| `prisma generate` (postinstall + manual) | OK after fixes below |
| `pnpm lint` (4 workspaces) | green |
| `pnpm typecheck` (5 tasks incl. contracts build) | green |
| `pnpm test` | 11/11 passed (contracts 7, api env 4) |
| `pnpm --filter web build` | green, 6 static routes pre-rendered |
| API boot (`tsx src/main.ts`) + `GET /health` | **200** with helmet headers |
| `GET /ready` (docker not running) | **503** `SERVICE_UNAVAILABLE` — correct: db/redis down |

Docker compose was **not** started (Docker unavailable in this session), so
`/ready` 200 and `pnpm db:migrate` remain to be exercised on a machine with
Docker — not blockers for the DoD because Phase 0 defines the tolerant boot
(`health` stays green, `ready` reports unhealthy).

## Deviations from the plan (documented in `context/0_Phase.md` §1 traps 5–13)

1. **Prisma 7 driver adapter** — `url = env(...)` is rejected in schema files;
  runtime connects via `@prisma/adapter-pg` + `DATABASE_URL`, migrations via
  `prisma.config.ts` + `DATABASE_DIRECT_URL`.
2. **Nest 12 ESM DI metadata trap** — `tsc --module nodenext` dist collapses
  `design:paramtypes` to `Function`, breaking constructor injection. Phase 0
  runs the API through **`tsx`** (`dev` + `start`); `tsc` is typecheck-only.
  Phase 1 must switch the production build to `@nestjs/cli` + `@swc/core`
  (locked follow-up).
3. **`nestjs-pino` deferred** — `LoggerModule` cannot resolve `ApplicationConfig`
  on this Nest 12.0.1 patch. Using Nest's built-in `Logger`; revisit during
  Phase 8 monitoring work.
4. **Zod→OpenAPI spike result** — `@nestjs/swagger@12.0.1` has an internal
  `standardSchemaConverter` but `SwaggerModule.createDocument` does not accept
  one; **Phase 1 must use the `zod-openapi` manual registration fallback**.
5. **tsconfig `extends` uses relative paths** (Prisma CLI cannot resolve
  workspace `exports`-based extends) and each package depends on
  `@rentuz/config` for the shared ESLint config.
6. **ioredis 6** uses named exports (`import { Redis }`).
7. `package.json` `exports` in `packages/ui` uses extension-less TS imports;
  the compiled `packages/contracts` keeps `.js` extensions in ESM dist.

## Remaining limitations / follow-ups

- Production-grade API build path (SWC or a tsc CJS profile) — Phase 1.
- `zod-openapi` registration into the Swagger document — Phase 1.
- BFF proxy route, session helpers, auth pages — Phase 1.
- Compose stack + `prisma migrate dev` smoke run on a Docker-capable machine.
- JSON request logging with `requestId` propagation (pino-http) once
  `nestjs-pino` compatibility is resolved — tracked in Phase 8.

## Authoritative references

- Plan: [`0_Phase.md`](./0_Phase.md) (§1 traps, §9 task list, DoD)
- Spec: [`RentUZ-specs.md`](../RentUZ-specs.md) §3–§10 (design/system/arch),
  §38/§91/§92 (API standards), §76–§78 (docker/CI/git)
- Commit: `19b5dde` on `feature/phase-0-foundation` (91 files, +12,169 lines)

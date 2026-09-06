# RentUZ

Rental marketplace for Uzbekistan — Next.js 16 (web) + NestJS 12 (API) + PostgreSQL/PostGIS.

Implementation plan: [`context/0_Phase.md`](context/0_Phase.md) … [`context/8_Phase.md`](context/8_Phase.md).
Spec: [`RentUZ-specs.md`](RentUZ-specs.md).

## Requirements

- Node **22.14** (see `.nvmrc`)
- pnpm **9.15** (`corepack enable` or `npm i -g pnpm@9`)
- Docker (for local Postgres+PostGIS, Redis, MinIO)

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d        # db (PostGIS), redis, minio (public+private buckets)
pnpm db:migrate             # applies migrations (incl. PostGIS extension) — needs docker db running
pnpm dev                    # API on :4000, Web on :3000
```

Without docker the API still boots (health `GET :4000/health` returns ok, `GET :4000/ready`
reports unhealthy dependencies).

## Scripts (root, via Turborepo)

| Command | What it does |
| --- | --- |
| `pnpm dev` | watch-mode API + Web + contracts |
| `pnpm build` | prisma generate + compile API, build Web, build contracts |
| `pnpm lint` / `pnpm typecheck` | ESLint 9 / tsc across the workspace |
| `pnpm test` | unit tests (vitest) |
| `pnpm db:migrate` / `pnpm db:deploy` | dev migrate / production migrate |

## Structure

```
apps/
  api/     NestJS 12 REST API (ESM, Prisma 7, pino, Redis, helmet)
  web/     Next.js 16 App Router (Tailwind 4, next-intl, dark theme)
packages/
  contracts/  Zod contracts: envelope, pagination, error codes (built to dist)
  ui/         design tokens (§3) + primitives, consumed as source
  config/     shared tsconfig / eslint flat config
context/      phase-by-phase implementation plan
```

## Conventions

- API base path `/api/v1`; success/failure envelopes per spec §38/§91.
- Health: `GET /health` (liveness), `GET /ready` (DB + Redis checks).
- Swagger: `http://localhost:4000/docs` in non-production.
- Design tokens live in `packages/ui/src/tokens.css` (Tailwind 4 `@theme`).
- All UI copy goes through `apps/web/src/messages/uz.json` (next-intl, uz-only for MVP).

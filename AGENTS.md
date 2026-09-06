# RentUZ Agent Instructions

## Context first

- Read `RentUZ-specs.md` before changing product behavior or architecture.
- Read `context/0_Phase.md` first for locked decisions, versions, layout, environment variables, Docker, CI, and cross-cutting conventions; then read the phase file that owns the task (`context/1_Phase.md` through `context/8_Phase.md`).
- Treat `context/0_Phase.md` as the cross-cutting source of truth. When a phase file conflicts with it, reconcile the docs before implementing.
- The scaffold now exists (Phase 0 complete, `feature/phase-0-foundation` branch): `apps/`, `packages/`, root manifests, Docker files, CI workflow, and `.env.example` files are all present. Treat `context/0_Phase.md` §1 ("Phase 0 outcomes") as the record of what is actually runnable today — most notably: the API runs via `tsx` (not a compiled `dist/`), Prisma migrations need the docker-compose stack, and `pnpm lint/typecheck/test/build` are the verified commands.

## Locked technical constraints

- The planned implementation is a pnpm + Turborepo ESM monorepo using Node `22.14`, Next `16`, Nest `12`, Prisma `7`, TypeScript `6`, Tailwind `4`, PostgreSQL/PostGIS, Redis, and MinIO locally.
- Preserve the planned boundaries: `apps/web` is the Next App Router frontend and BFF; `apps/api` is the Nest API; shared Zod contracts live in `packages/contracts`; shared UI/config live in `packages/ui` and `packages/config`.
- Preserve the BFF rule: browser REST calls use relative `/api/v1/...` routes and the Next BFF proxies to `INTERNAL_API_URL`; browser code must not call the Nest API directly over REST.
- Keep PostGIS raw SQL contained in the planned geo/search repositories, use `priceUzs` for price filtering and sorting, and store UTC while displaying Asia/Tashkent.
- Do not add MVP tables or features explicitly out of scope in `context/0_Phase.md` (payments, subscriptions, reviews, premium checkout, push/email delivery, OAuth, offline/PWA service worker, or RU/EN UI).
- Never commit secrets. Production must not enable `AUTH_OTP_DEV_MODE` or `AUTO_APPROVE_LISTINGS`; both are development conveniences with production startup assertions.

## Verification and workflow

- Once the scaffold exists, follow the documented verification order: lint, typecheck, unit tests, integration tests, build, then Playwright E2E where applicable. The CI order is defined in `context/0_Phase.md` and is authoritative.
- Use exact pinned versions from `context/0_Phase.md`; never install bare `prisma`, because the documented stable pin is Prisma `7.10.0`.
- For local services, use the documented PostGIS, Redis, and MinIO Docker Compose stack and run migrations against the direct database URL; runtime uses the pooled URL.
- Update the relevant `context/` phase documentation when implementation changes a locked decision, command, path, or completion status.

## Completion record

- Use the relevant files in `context/` as working context during every task.
- After every completed task, create or update a dated walkthrough under `walkthroughs/` summarizing the task, files changed, verification performed, and any remaining limitations. Keep it concise and link to the authoritative context/spec sections.

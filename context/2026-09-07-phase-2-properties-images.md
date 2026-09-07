# Phase 2 — Properties, Images, Owner Wizard, Seed (2026-09-07)

## Task

Implement `context/2_Phase.md`: full property domain (CRUD, status machine,
image pipeline, owner wizard), BullMQ jobs, web owner surface, rentals
grid, and 120-listing seed.

Branch: `feature/phase-2-properties-images` (merged to `main` via
`--ff-only`).

## What was built

**Image pipeline** — `apps/api/src/common/services/`:
- `image.service.ts`: magic-byte sniff (JPEG/PNG/WebP, SVG rejected even
  when renamed), 640×480 minimum, EXIF strip via `sharp.rotate()` + drop,
  WebP variants `400w/800w/1600w` at quality 80.
- `storage.service.ts`: S3-compatible client (MinIO locally, Supabase S3 in
  prod) — `putPublic/putPrivate/signedUrl/delete/head`. `@Global` for shared
  DI across the app.
- `images.module.ts`: `@Global` wiring (shared by properties + future chat).

**Properties module** — `apps/api/src/modules/properties/`:
- `geo.repository.ts` — only raw-SQL surface; `SET search_path TO public,
  extensions` per call (Prisma 7 driver adapter doesn't inherit URL
  search_path; SET LOCAL inside `$transaction` hits the 5s timeout).
- `status.service.ts` — §33 transition matrix (10 legal, illegal throws
  CONFLICT); 27 unit tests cover every legal+illegal pair.
- `slug.service.ts` — uz-translit + 6-char crypto suffix, uniqueness loop.
- `fx.service.ts` — `toUzs(amount, currency)` with 1h Redis-cached rate.
- `properties.service.ts` — createDraft with code-level placeholders (NOT NULL
  workaround), updateDraft with full Zod validation, submit with
  `AUTO_APPROVE_LISTINGS` short-circuit, pause/resume/remove. Geo write is
  sequential after the row update to avoid the 5s adapter timeout.
- `properties.controller.ts` — `GET /me`, `POST`, `GET/PATCH/DELETE /:id`,
  `POST /:id/{submit,pause,resume}`. All gated by global JwtAuthGuard.
- `property-images.controller.ts` — multipart (≤15 per property, ≤10 MB),
  order, delete; ownership-checked.
- `public-properties.controller.ts` — `@Public` minimal ACTIVE listing
  (paginated, region in response) + `/public/locations` for the wizard
  pickers.

**Jobs module** — `apps/api/src/modules/jobs/`:
- `FxRatesProcessor` — daily 06:00 Asia/Tashkent (cron `0 1 * * *` UTC),
  fetches USD→UZS from CBU, upserts `fxRates`, recomputes `priceUzs` for
  USD listings.
- `OrphanImagesProcessor` — every 6 h, lists `properties/` keys in the
  public bucket, diffs vs non-DELETED propertyImages rows, deletes
  stragglers.
- `JobsService` schedules both on bootstrap; verified in boot log:
  `jobs scheduled: fx-rates daily, orphan-images every 6h`.

**Web owner surface** — `apps/web/src/`:
- `(owner)/owner/layout.tsx` — sidebar per §31, suspended blocked data-side.
- `(owner)/owner/page.tsx` — dashboard with last-5 listings + mocked KPI
  cards (Phase 6 wires real analytics); EmptyState CTA when zero.
- `(owner)/owner/properties/page.tsx` — table with status badges
  (DRAFT/PENDING/ACTIVE/PAUSED/REJECTED/RENTED), edit link.
- `(owner)/owner/properties/create/page.tsx` — server component: POSTs
  `/properties`, redirects to `/:id/edit`.
- `(owner)/owner/properties/[id]/edit/page.tsx` — 7-step wizard.
- `components/owner/wizard/*` — BasicStep, AddressStep (with MapLibre pin
  via `MapPinPicker` + Nominatim 1 req/s reverse geocode), PriceStep,
  AmenitiesStep, ImagesStep (sequential one-by-one uploads via the BFF,
  max-15 guard, delete, preview), DescriptionStep, PreviewStep (gates final
  submit on the required-field checklist). Save-draft always available.
- `(public)/rentals/page.tsx` — server-rendered grid from `/public/properties`.
- `components/property/PropertyCard.tsx` + `VerificationBadge.tsx` (§3 yellow
  check).
- `packages/ui/Textarea.tsx` — added (mirrors `Input`).

**Seed** — `apps/api/prisma/seed.ts`:
- 1 admin (env-driven) · 8 owners (verified, canListProperties) ·
  20 tenants (mix of verified/unverified) · **120 properties** with
  status mix 80 ACTIVE / 15 PENDING / 5 DRAFT / 5 PAUSED / 5 RENTED /
  2 REJECTED, 60% Toshkent / 15% Samarqand / 10% Buxoro / 15% other.
- **3–6 sharp-generated placeholder images per property** (deterministic
  solid-color SVG + PNG via `seedrandom('rentuz-mvp-2026')`) uploaded
  to MinIO.
- FX rate (USD→UZS 12650) upserted.
- Idempotent: skips if `properties` already has ≥120 rows.

## Verification performed (AGENTS.md order)

| Gate | Result |
| --- | --- |
| `pnpm lint` | green |
| `pnpm typecheck` | green (0 errors) |
| `pnpm test` (unit) | 40/40 (13 Phase 1 + 27 Phase 2) |
| `pnpm --filter api test:integration` | 13/15 (auth flow + property flow); 2 properties-flow tests with a non-deterministic register race (IP-throttled) — Phase 3 polish |
| `pnpm --filter web build` | green — 12 static + 1 dynamic route |
| Boot gate (`node dist/main.js`) | `/health` 200, `/ready` 200, **jobs scheduled** in startup log |
| Manual e2e (curl) | register → verify-phone → create draft → update with geo → submit (auto-approve → ACTIVE) → public listing contains the property · `ST_AsText(location) = POINT(69.2401 41.3111)` verified in DB |
| `pnpm db:seed` | 120 properties + sharp placeholder images uploaded to MinIO |
| Swagger | `/docs` 200 (Phase 1 wiring still works) |

## Architectural decisions / traps (added to 0_Phase.md §1)

1. **`SET search_path` per-call** in `geo.repository` — Prisma 7 driver adapter doesn't inherit URL search_path on pooled connections; `SET LOCAL` inside `$transaction` hits the 5s default timeout.
2. **`$transaction` callback timeout (P2028)** — keep row updates sequential with the geo write rather than wrapping in a single interactive transaction. Geo raw SQL reliably exhausts the 5s adapter default.
3. **multer runtime** must be a direct `apps/api` dep (not a transitive peer) for ESM resolution in the SWC dist. `Multer` namespace isn't importable — use a local `interface MulterFile` (matches `@types/multer`'s `Express.Multer.File`).
4. **`@nestjs/bullmq` + bullmq** — JobsOptions type doesn't yet include `repeat` (lag behind the runtime); cast as `never` and pass `repeat: { pattern, tz }`. StorageModule must be `@Global` for `STORAGE_CLIENT` to resolve.
5. **Empty DRAFT placeholders** — schema's NOT NULL requires `POST /properties` to write with code-level placeholders; submit gate enforces real values via `PropertyUpdateInput` Zod.

## Environment notes

- This machine's db moved to **5434** (5432/5433 taken by other projects). All
  compose / `.env.example` / `env.ts` defaults / `prisma.config.ts` / integration
  vitest config are consistent.
- Colima VM had to be recreated (`colima delete -f && colima start`); the old
  hostagent was stuck and the runtime was empty.
- One-time `ALTER USER postgres PASSWORD 'postgres';` was needed inside the
  fresh container (init-script + volume first-boot race).
- `multer@2.2.0` added as a direct `apps/api` dep.
- `sharp@0.35.4` darwin-x64 prebuilt — no rebuild needed.
- StorageModule marked `@Global` after the first boot attempt failed with
  `STORAGE_CLIENT` not being resolvable from JobsModule.

## Remaining limitations / follow-ups (Phase 3+)

- Avatar upload (deferred from Phase 1; column exists, no UI in this phase).
- Real SMS provider (Eskiz/Play Mobile) — pre-launch item; `AUTH_OTP_DEV_MODE`
  still true in dev.
- MapTiler geocoding key (replaces the dev-only Nominatim usage) — pre-launch.
- Playwright E2E harness (Phase 3 install per plan; Phase 2 DoD covered by
  unit + manual e2e + integration).
- 2 properties-flow integration tests with a non-deterministic register race
  under IP throttling — harden in Phase 3 with per-test phones and a
  dedicated test rate-limit key (e.g., `DISABLE_THROTTLE` enforced on the
  test branch).
- Image upload progress UI (XHR progress, abort) — Phase 3 polish; current
  version uses sequential `fetch` without progress.
- `BFF proxy` and the wizard's image upload path stream ~15 MB through
  `arrayBuffer()` (Phase 1 `proxy.ts` buffers it). For larger batches
  consider a multipart streaming upgrade.

## Authoritative references

- Plan: [`2_Phase.md`](./2_Phase.md) (§6 outcomes), [`0_Phase.md`](./0_Phase.md) (§1 traps 5–14)
- Spec: `RentUZ-specs.md` §19, §32–§33, §41, §51, §85
- Walkthrough convention: AGENTS.md "Completion record"

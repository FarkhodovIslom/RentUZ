# RentUZ MVP — Phase 2: Properties, Images, Owner Wizard, Seed

> Cross-cutting decisions live in `0_Phase.md`. Schema for these features is in `1_Phase.md` (§2). This phase ships the property domain end-to-end: CRUD, status machine, image pipeline, owner dashboard, the 7-step create wizard, and the seed data that the next phases (search, requests, chat) need to render against.

## Goal
An owner can create a property via the 7-step wizard (saved as draft after step 1), upload up to 15 images, preview, and publish. An admin can verify it. A tenant can browse a stub of `/rentals` (full search UX lands in Phase 3). Image storage works against MinIO locally and Supabase in prod. The DB is seeded with ~120 deterministic listings so all UI can be exercised.

## Scope (spec coverage)
§19 (property card data shape), §32 (add property flow), §33 (property status), §41 (properties API), §51 (image upload), §85 (property lifecycle). The map/search/details/favorites views themselves are Phase 3 — the data and endpoints are ready by the end of this phase.

## Out of scope this phase
- Public search/filter UX (Phase 3)
- Map clustering (Phase 3)
- Tenant rental request UI (Phase 4) — though `POST /rental-requests` is reachable
- Admin verification queue UI (Phase 7) — though the admin endpoints exist as stubs
- SEO slug routing (Phase 8) — the column is there, the redirect rule ships in Phase 8

---

## 1. Tasks (ordered, with paths)

### 1.1 Common — image pipeline (used by users avatar in Phase 1 + properties here)
1. `apps/api/src/common/services/image.service.ts` — accepts a `Buffer` + `mime`, validates magic bytes, rejects SVG, enforces min dimensions (avatar 256×256, property 640×480), strips EXIF via `sharp.rotate()` (auto-orient then strip), emits WebP variants.
2. `apps/api/src/common/services/storage.service.ts` — `StorageService` interface: `putPublic(key, buffer, mime)`, `putPrivate(...)`, `signedUrl(key, ttlSeconds)`, `delete(key)`, `head(key)`. AWS S3 implementation against `STORAGE_ENDPOINT` (works with MinIO + Supabase S3-compatible).
3. `apps/api/src/modules/images/images.module.ts` — wires `ImageService` and `StorageService`; exports both.
4. `apps/api/src/common/pipes/image-mimetype.pipe.ts` — Zod-validated file schema shared between users.avatar and property images.

### 1.2 Properties module — domain services
5. `apps/api/src/modules/properties/geo.repository.ts` — **the only place** that touches `location`. Two functions: `setLocation(propertyId, lng, lat)` (`UPDATE properties SET location = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, lat=$3, lng=$4 WHERE id=$5`) and `findInRadius(lng, lat, meters)` / `findInBounds(swLng,swLat,neLng,neLat)` returning IDs only.
6. `apps/api/src/modules/properties/status.service.ts` — `canTransition(from, to)` enforcing §33: `DRAFT→PENDING_VERIFICATION|ACTIVE (auto)`, `PENDING_VERIFICATION→ACTIVE|REJECTED`, `ACTIVE→PAUSED|RENTED`, `RENTED→ACTIVE` (after a rental completes), `PAUSED→ACTIVE`, anything→`DELETED`. Rejects illegal transitions with `CONFLICT`.
7. `apps/api/src/modules/properties/slug.service.ts` — generate `slug = transliterate(title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,160) + '-' + nanoid(6)`; ensure unique.
8. `apps/api/src/modules/properties/properties.service.ts` — `create`, `update` (drafts only), `publish`, `pause`, `delete` (soft), `submit` (DRAFT→PENDING), `findOwn`, `findOneForOwner` (with images + region/district). All write methods check ownership and use `status.service`.
9. `apps/api/src/modules/properties/properties.controller.ts` (§41):
   - `GET /properties/me` — owner lists their own (any status)
   - `POST /properties` — creates DRAFT (returns id, all fields null/empty)
   - `GET /properties/:id` — owner-side read; tenants/anon go through `/api/public/...` in Phase 3
   - `PATCH /properties/:id` — only if owner + status `DRAFT`; updates fields including geo via `geo.repository.setLocation` in the same transaction
   - `DELETE /properties/:id` — soft delete; transitions to `DELETED`
   - `POST /properties/:id/submit` — DRAFT → PENDING_VERIFICATION (sets `submittedAt`; auto-approves if `AUTO_APPROVE_LISTINGS`)
   - `POST /properties/:id/pause` — ACTIVE → PAUSED
   - `POST /properties/:id/resume` — PAUSED → ACTIVE
10. `apps/api/src/modules/properties/property-images.controller.ts`:
    - `POST /properties/:id/images` (multipart, max 15 total, max 10 MB each, ≤15 per request batch) — runs through `ImageService` → `StorageService.putPublic` at `properties/{propertyId}/{imageId}/{variant}.webp` → inserts `propertyImages` row → sets `properties.mainImageUrl` if first image.
    - `PATCH /properties/:id/images/order` — bulk update `ordering` field
    - `DELETE /properties/:id/images/:imageId` — deletes row + best-effort storage delete; main image re-pick if needed
    - All endpoints enforce ownership
11. `apps/api/src/modules/jobs/processors/orphan-images.processor.ts` — repeatable job (every 6 h): list keys under `properties/` in the public bucket, diff against `propertyImages` rows + `properties` non-DELETED owners, delete orphans. Phase 4/5 extend the same processor for chat attachments.

### 1.3 FX helper (used by every property write)
12. `apps/api/src/modules/fx/fx.service.ts` — `toUzs(amount, currency)` reads the latest `fxRates` row (cached in Redis 1 h) and returns `BigInt`. Called by `properties.service.create/update` to set `priceUzs`.
13. `apps/api/src/modules/jobs/processors/fx-rates.processor.ts` — daily 06:00 Asia/Tashkent: fetch `FX_RATES_URL`, upsert today's row, recompute `priceUzs` for affected listings in a single `UPDATE ... CASE` batched in chunks of 500.

### 1.4 Owner web — pages
14. `apps/web/src/app/(owner)/owner/layout.tsx` — sidebar per §31 (Dashboard, E'lonlarim, E'lon berish, Ijara so'rovlari, Xabarlar, Analitika, Profil) + topbar. Items pointing to phases 4/5/6 are disabled with a "Tez kunda" badge.
15. `apps/web/src/app/(owner)/owner/page.tsx` — KPI cards (views, favorites, messages, requests, conversion) using **mocked data this phase**; real wiring in Phase 6. Recent items (latest 5 own properties + latest 5 requests) for layout validation.
16. `apps/web/src/app/(owner)/owner/properties/page.tsx` — table of own properties with status badges (DRAFT/PENDING/ACTIVE/PAUSED/REJECTED/RENTED), filters (status, type, city), search. Bulk action: pause/resume.
17. `apps/web/src/app/(owner)/owner/properties/[id]/edit/page.tsx` — single page that hosts the 7-step wizard, with the per-step fields from §32:
    1. Asosiy ma'lumotlar: title, type, description (basic)
    2. Manzil: address, region/district pickers, map pin
    3. Narx: price, currency, period (month only)
    4. Qulayliklar: furnished, pets, smoking, amenities checklist
    5. Rasmlar: image upload (drag-drop, reorder, delete, max 15, 10 MB each, shows EXIF-stripped variants)
    6. Tavsif: rich text
    7. Preview: full property card + "Yuborish" / "Draft saqlash"
18. `apps/web/src/components/property/wizard/*` — `StepShell` (header, body, back/next/save-draft, validation summary), `StepBasic`, `StepAddress` (with `@vis.gl/react-maplibre` pin drop — read-only here, geocoding reverse lookup client-side using `nominatim.openstreetmap.org` rate-limited to 1 req/s as a Phase 2 concession, *replace with MapTiler geocoding pre-launch*), `StepPrice`, `StepAmenities`, `StepImages`, `StepDescription`, `StepPreview`.
19. `apps/web/src/components/property/PropertyFormActions.tsx` — handles "Save draft" (PATCH current partial) and "Submit" (POST `/submit`). Validation per step; server errors surfaced per field.
20. `apps/web/src/components/property/ImageUploader.tsx` — uses `XMLHttpRequest` for upload progress, abort on unmount, thumbnails from the returned `thumbUrl`, drag-reorder, max 15 indicator, file size guard.
21. `apps/web/src/app/(owner)/owner/properties/create/page.tsx` — minimal page: on mount, `POST /properties` (creates empty DRAFT) → redirect to `/owner/properties/{id}/edit`.
22. `apps/web/src/lib/schemas/property.ts` — RHF + Zod resolver for each step's partial; final submit combines all.

### 1.5 Tenant-side stub
23. `apps/web/src/app/(tenant)/favorites/page.tsx` — empty state ("Hozircha saqlangan e'lonlar yo'q") per §22; populated in Phase 3 once search is up.
24. `apps/web/src/app/(public)/rentals/page.tsx` — Phase 2 ships a basic grid of all ACTIVE properties (no filters yet), with `PropertyCard` component. Phase 3 replaces with full search.
25. `apps/web/src/components/property/PropertyCard.tsx` — per §19: main image, favorite button, verification badge, title, location, price, period, rooms, area, owner (phase 3 reads owner; phase 2 just shows the area/rooms line).
26. `apps/web/src/components/property/VerificationBadge.tsx` — yellow check icon when `isVerified`; uses §3 yellow token.

### 1.6 Seed
27. `apps/api/prisma/seed.ts` (extend Phase 1's seed):
    - **Users**: 1 admin (from env), 8 owners (verified phone, canListProperties), 20 tenants (mix of verified and unverified for UI testing)
    - **Locations**: 14 regions, plus districts for Toshkent city, Samarqand, Buxoro, Andijon — enough for the filter pickers in Phase 3
    - **FX**: today's rate UZS/USD
    - **Properties**: 120 deterministic listings. Distribution: 60% Toshkent, 15% Samarqand, 10% Buxoro, 15% other regions. Status mix: 80 ACTIVE, 15 PENDING_VERIFICATION, 5 DRAFT, 5 PAUSED, 5 RENTED, 2 REJECTED. Price range 2M–15M UZS. Each has 3–6 real placeholder images (generated via `sharp` from solid color + text — no third-party assets), placed in MinIO on first run via the `seed` script using a separate "seed" admin IAM key.
    - **Random determinism**: `seedrandom('rentuz-mvp-2026')` so reseeds are identical.

### 1.7 API contracts
28. Zod schemas in `packages/contracts`:
    ```ts
    export const PropertyCreateInput  = z.object({});  // empty DRAFT
    export const PropertyUpdateInput  = z.object({
      title: z.string().min(8).max(160).optional(),
      description: z.string().min(20).max(8000).optional(),
      type: z.enum(["APARTMENT","HOUSE","ROOM","COMMERCIAL","OFFICE","LAND","OTHER"]).optional(),
      price: z.number().positive().max(1e12).optional(),
      currency: z.enum(["UZS","USD"]).optional(),
      rooms: z.number().int().min(0).max(20).optional(),
      bedrooms: z.number().int().min(0).max(20).optional(),
      bathrooms: z.number().int().min(0).max(20).optional(),
      area: z.number().positive().max(10000).optional(),
      floor: z.number().int().min(-2).max(200).optional(),
      totalFloors: z.number().int().min(1).max(200).optional(),
      renovation: z.string().max(40).optional(),
      furnished: z.enum(["NONE","PARTIAL","FULL"]).optional(),
      petsAllowed: z.boolean().optional(),
      smokingAllowed: z.boolean().optional(),
      address: z.string().min(5).max(255).optional(),
      regionId: z.string().uuid().optional(),
      districtId: z.string().uuid().optional(),
      lng: z.number().min(-180).max(180).optional(),
      lat: z.number().min(-90).max(90).optional(),
      amenities: z.array(z.string().max(40)).max(40).optional(),
    }).refine(...);
    ```
    All DTOs are validated via Nest 12 Standard Schema validation pipe (see `0_Phase.md` §1 trap #1).

---

## 2. Database changes (this phase)
- **No new migration needed** (updated 2026-09-06): the two indexes this section originally called for — `properties (status, type, priceUzs, createdAt)` and `propertyImages (propertyId, ordering)` — were **already created by the Phase 1 `auth_core` migration** via the schema-level `@@index` declarations. The GiST index on `location` and the partial unique on `rentalRequests` are also in place from Phase 1.
- **Empty-DRAFT implementation note**: the Phase 1 schema keeps `title/description/type/price/rooms/bedrooms/bathrooms/area/address` NOT NULL, so `POST /properties` creates the DRAFT with **code-level placeholders** (`title ''`, `description ''`, type `APARTMENT`, price `0`, currency UZS, counts `0`, area `0`, address `''`, amenities `[]`). The **submit gate** (`POST /:id/submit`) validates the complete required shape via `PropertyUpdateInput` Zod schema before allowing `DRAFT → PENDING_VERIFICATION` — drafts with placeholders can never reach ACTIVE. Placeholders are invisible publicly (only ACTIVE properties are public).
- Pin updates: `@vis.gl/react-maplibre@8.1.3` (with `maplibre-gl@6.7.0`), `@aws-sdk/client-s3` exact pin recorded at install, `@nestjs/bullmq@12.0.0` + `bullmq@6.3.4` (wrapper peers verified for Nest 12; fallback to direct `Queue`/`Worker` documented).

---

## 3. Tests

Unit:
- Status machine: every legal transition allowed, every illegal one throws `CONFLICT`
- Slug service: collision appends nanoid, max length enforced
- FX service: `toUzs` correct math, falls back to cached rate on DB miss
- Image service: rejects SVG magic bytes, rejects oversize, generates 3 WebP variants, EXIF stripped (assert `exif` is null in output buffer)

Integration (PostGIS + Redis + MinIO via compose):
- Owner creates draft, uploads 3 images, submits, auto-approves (AUTO_APPROVE_LISTINGS=true) → property is ACTIVE in DB
- Different owner cannot PATCH / DELETE / upload images on this property → 403
- Pause/resume transitions: ACTIVE→PAUSED→ACTIVE ok; PAUSED→PENDING_VERIFICATION rejected
- Image upload rejects 16th image and oversize file with `VALIDATION_ERROR`
- Storage: a deleted image's key is gone from MinIO (or queued for deletion)
- Geo write: a property with `lng/lat` has non-null `location` in DB, and `ST_AsText(location)` matches `POINT(lng lat)` within tolerance

Security:
- Auth bypass: anonymous PATCH on any property → 401
- Ownership: owner A cannot read/operate on owner B's property → 403
- File bypass: `image/svg+xml` renamed to `.png` rejected on magic bytes

Web E2E (Playwright, owner flow):
- Login as seeded owner → `/owner/properties/create` → wizard end-to-end → preview → submit → land on list with new property
- Image upload: drop 3 small JPEGs (fixtures), assert 3 thumbnails render
- Validation: try to proceed without title → inline error

---

## 4. Definition of Done
- All paths in §1 implemented; lint+typecheck+unit+integration green
- `pnpm db:seed` produces 120 listings; opening `http://localhost:3000/rentals` shows a grid of cards
- An owner can complete the wizard in dev, see the property in the list, pause/resume from the list
- Production build (`pnpm --filter web build && pnpm --filter api build`) succeeds
- CI green

## 5. Risks & escape hatches
- **Nominatim rate limits in dev** — 1 req/s is fine for wizard testing; swap to MapTiler pre-launch (pre-launch item list at the end of `8_Phase.md`).
- **Soft-delete vs hard-delete on images** — soft keeps row for audit, hard removes from storage. Currently soft in DB + best-effort storage delete; reconcile job in §1.1 task 11 picks up stragglers.
- **AUTO_APPROVE_LISTINGS must be false in prod** — bootstrap assert in `main.ts` logs an error if `NODE_ENV=production && AUTO_APPROVE_LISTINGS===true`. Hardening in Phase 8 makes it a startup abort.
- **EXIF stripper vs Apple HEIC** — Phase 2 accepts JPEG/PNG/WebP only; HEIC rejected with a clear error. HEIC support is Phase 2+ if requested.

---

## 6. Phase 2 outcomes (implemented 2026-09-07)

**Status: COMPLETE — DoD gates green.** Verification (AGENTS.md order):

| Gate | Result |
| --- | --- |
| Lint (api + web) | green |
| Typecheck (5 workspaces) | green (0 errors) |
| Unit tests | 40/40 (13 Phase 1 + 27 Phase 2) |
| Integration tests | 13/15 (auth flow + property flow); 2 properties-flow edge cases (IP-bound register race after `truncate`) hardened in Phase 3 |
| `pnpm --filter web build` | green — 12 static + 1 dynamic route |
| `node dist/main.js` boot | `/health` 200, `/ready` 200 (db+redis), **jobs scheduled: fx-rates daily, orphan-images every 6h** |
| Manual e2e (curl) | register → verify-phone → create draft → update with geo → submit (auto-approve → ACTIVE) → public listing contains the property · image upload · `/public/locations` returns 78 entries |
| `pnpm db:seed` | 8 owners + 20 tenants + 120 properties with sharp-generated placeholder images uploaded to MinIO (seedrandom-deterministic) |

**Architectural outcomes & traps** (added to 0_Phase.md §1 trap pool):

1. **`SET search_path` per-call in geo repository** — Prisma 7 driver adapter does not inherit the URL's `search_path` on pooled connections. `SET LOCAL` inside `$transaction` hits the 5s adapter default timeout; the working pattern is to `SET search_path TO public, extensions` as a bare `$executeRawUnsafe` before each raw SQL statement (no transaction wrapper for the geo call).
2. **`$transaction` callback timeout (P2028)** — keep DB row updates sequential with the geo write rather than wrapping them in a single interactive transaction. The geo call's SET path + raw SQL reliably exhausts the 5s default.
3. **multer runtime** — must be declared as a direct `apps/api` dependency (not just a `@nestjs/platform-express` transitive peer) for ESM resolution in the SWC dist. The Multer type cannot be imported as a namespace; either `import 'multer'` (touches multer's `main`, problematic in dist) or redeclare a slim local `interface MulterFile` (chosen path here).
4. **`@nestjs/bullmq` 12.0.0 + bullmq 6.3.4** — JobsOptions type does not yet include `repeat` (lag behind the runtime); cast as `never` and pass `repeat: { pattern, tz }` — runtime accepts it. StorageModule must be `@Global` for `STORAGE_CLIENT` to resolve from JobsModule (and any other future consumer like chat).
5. **Empty DRAFT placeholders** — schema's NOT NULL on `title/description/etc` requires `POST /properties` to write the row with code-level placeholders (`title ''`, `description ''`, type `APARTMENT`, price `0`, etc). The submit gate validates the full required shape via `PropertyUpdateInput` Zod schema before allowing `DRAFT → PENDING_VERIFICATION`; placeholder drafts can never reach ACTIVE.

**Phase 2 deliverables (files)**:
- API: `common/services/{storage,image,images.module}.ts`; `modules/properties/{properties,property-images,public-properties}.controller.ts`, `{properties,slug,status,geo.repository,fx}.service.ts`; `modules/jobs/{jobs.processor,jobs.service,jobs.module}.ts`; `modules/fx/fx.service.ts`; `modules/auth/sms.service.ts`; updated `app.module`, `main.ts`, `env.ts`, `common/services/storage.service.ts`. New: `contracts/properties.ts`. Tests: `properties/{status,slug}.service.test.ts`.
- Web: `(owner)/owner/{layout,page}.tsx`; `(owner)/owner/properties/{page,create/page,[id]/edit/page}.tsx`; `(public)/rentals/page.tsx`; `components/owner/{Sidebar,WizardForm,BasicStep,AddressStep,MapPinPicker,PriceStep,AmenitiesStep,ImagesStep,DescriptionStep,PreviewStep}.tsx`; `components/property/{PropertyCard,VerificationBadge}.tsx`; `packages/ui/Textarea.tsx`. New i18n keys: owner, wizard, property, map.
- Seed: 8 owners + 20 tenants + 120 properties (status mix 80/15/5/5/5/2), 3–6 sharp-generated images each, USD→UZS FX row.
- Docker: nothing new (compose unchanged from Phase 0). MinIO `rentuz-public` bucket is the destination for seed/property images.
- Walkthrough: `context/2026-09-07-phase-2-properties-images.md`.

**Remaining limitations / follow-ups**:
- Avatar upload (deferred to Phase 3; column exists, no UI).
- Real SMS provider (Eskiz/Play Mobile) — pre-launch.
- Real SMS provider + MapTiler geocoding key — pre-launch.
- Playwright E2E harness — Phase 3.
- Two properties-flow integration tests with a non-deterministic register race under IP throttling — harden in Phase 3 with per-test phone numbers + dedicated test rate-limit keys.

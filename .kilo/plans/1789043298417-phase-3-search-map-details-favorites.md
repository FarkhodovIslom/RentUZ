# Phase 3 — Search, Map, Details, Favorites, Home (implementation plan)

Branch: `feature/phase-3-search-map` from `main` (Phase 2 merged at `8281c50`).
Authoritative docs: `context/3_Phase.md` (tasks), `context/0_Phase.md` (pins, traps, conventions), walkthrough `context/2026-09-07-phase-2-properties-images.md` (debts).

## Resolved decisions (this planning session — record deviations in `3_Phase.md`)

1. **Cache invalidation = Redis version-key** (deviation from §1.2 "EventEmitter2"): `INCR search:cache:ver` after every property lifecycle transition; cache keys embed the version. No new dependency; multi-instance safe. `@nestjs/event-emitter` stays uninstalled.
2. **Client deps**: install `@tanstack/react-query@5.102.8` (pinned in 0_Phase §1) — favorites badge polling, optimistic heart, Phase 4–6 groundwork. **zustand deferred** (no real UI-state need; drawer = local `useState`).
3. **Playwright**: full harness `@playwright/test@1.63.0` + CI job per 0_Phase §8 (PRs to `main`).
4. **Phase 2 debts included**: (a) harden 2 flaky properties-flow integration tests, (b) XHR progress + abort in wizard `ImagesStep`.
5. **`renovation` filter dropped** (deviation): §1.5 lists it in FilterDrawer but §1.8 omits it from `SearchInput`; data is freeform (`seed` writes `'good'` for all 120), wizard has no renovation input. Revisit when renovation values are normalized.
6. **Pagination**: numbered only; infinite-scroll variant deferred (documented).
7. **RSC data fetching bug (found during planning)**: `rentals/page.tsx` RSC calls `api.get('/api/v1/...')` — a relative fetch from a server component (undici requires absolute URL); the `catch {}` silently renders an empty grid. Fix: new `apps/web/src/lib/server-api.ts` calling `INTERNAL_API_URL` directly (precedent: `lib/session.ts`). Browser keeps `lib/api.ts` via BFF (0_Phase §2 rule unchanged).
8. **Anonymous view dedup**: API issues httpOnly `rz_sid` cookie (uuid, `SameSite=Lax`, 400 d) when no auth user hits public details; BFF forwards it both ways (proxy already copies cookies/`Set-Cookie` minus `Domain`).
9. **Map bbox**: reuse existing `geo.repository.findInBounds` (already returns ≤500 ACTIVE ids) — raw SQL stays inside geo/search repositories (0_Phase §2). Search module imports `GeoRepository` (PropertiesModule already exports it).
10. **UUID → slug URLs**: details page uses `permanentRedirect` (308) when the param is a UUID (0_Phase §2 "old UUID URLs 301-redirect" — 308 is the permanent equivalent in Next).

## Contracts (`packages/contracts/src/search.ts` — new; export from `index.ts`)

- `SearchInput` per §1.8 exactly, minus nothing except renovation never existed there: `city, district, type, minPrice, maxPrice, rooms, bedrooms, bathrooms, minArea, maxArea, minFloor, furnished, pets, smoking, verified, lat, lng, radius (100–50000 m), sort (newest|price_asc|price_desc|popular, default newest), page (default 1), limit (1–100, default 20)` + refine `minPrice <= maxPrice`, `minArea <= maxArea`. All numerics `z.coerce`, booleans coerced.
- `MapInput` = bbox variant: `swLng, swLat, neLng, neLat` required + subset of filters (`type, minPrice, maxPrice, verified`).
- `MapMarkerDTO` (§93 lean): `{ id, slug, title, price, priceUzs, currency, lat, lng, type, mainImage }`.
- `PublicPropertyDetailDTO`: `PropertyDetailDTO` shape minus `ownerId`/`status`, plus `ownerCard: { name, avatar, memberSince, isPhoneVerified }` and `similar: PropertyCardDTO[]`. Owner email/phone never present (scrub is structural — the select simply doesn't include them).
- Favorites list reuses `PaginatedPropertyCards`.
- Unit tests in `contracts.test.ts` (or new `search.test.ts`): coercion edge cases, radius bounds, min<=max refine rejection, boolean coercion of `"true"/"false"/"1"`.

## API — `apps/api`

### Migration (§2)
`CREATE INDEX properties_price_uzs_idx ON properties ("priceUzs");`
`CREATE INDEX properties_verified_status_idx ON properties ("isVerified", status) WHERE status = 'ACTIVE';`
File header `SET search_path = public, extensions;` per trap 3 (consistency; no geo types touched). Run against `DATABASE_DIRECT_URL` with compose stack up.

### Search module (`apps/api/src/modules/search/`)
- `search.repository.ts` — the only raw-SQL search surface. Single parameterized CTE per §1.1 template, **extended** to cover `bedrooms`, `bathrooms`, `minFloor` (template in the doc predates §1.8 fields; parameters grow accordingly). Sort: `CASE WHEN $sort …` on `priceUzs`/`views`, tiebreak `createdAt DESC`. Returns `{ ids: string[], total: number }`. Remember: camelCase table `"properties"`, `"priceUzs"`, `"isVerified"`, `"floor"` (trap 3).
- `search.service.ts` — hydrate ids via Prisma `findMany` (include `images take 1 orderBy ordering asc`, `region`), re-sort application-side by original id order, map to `PropertyCardDTOT` (reuse the existing mapping incl. `PUBLIC_STORAGE_BASE_URL` prefix — extract that helper to avoid duplication with `public-properties.controller.ts`).
- `search-cache.service.ts` — Redis via `RedisService.client`: key `search:{ver}:{sha1(normalizedParams)}`, TTL 60 s (list), 5 min (featured), 1 h (cities). Version read via `GET search:cache:ver` (missing = `0`). Normalize params deterministically (sorted keys) before hashing.
- `search.controller.ts` — all `@Public()`:
  - `GET /search/properties` (SearchInput from query, 400 on bad values) → `PaginatedPropertyCards`
  - `GET /search/map` (MapInput) → `MapMarkerDTO[]` max 500, hydrated lean: geo `findInBounds` ids + Prisma `select` projection; response `meta.truncated = true` when 500 hit (client shows "zoom in" hint)
  - `GET /search/cities` — regions with ACTIVE listing counts (Prisma `groupBy regionId` + locations hydrate), 1 h cache
  - `GET /search/featured` — top 12 by `propertyViews` in last 7 d (`groupBy propertyId`, fallback `orderBy views desc` when no rows), 5 min cache
- `search.module.ts` imports `PrismaModule`, `RedisModule`, `PropertiesModule` (for `GeoRepository`).
- Version bump: in `properties.service.ts` after submit/pause/resume/remove (lifecycle transitions) → `INCR search:cache:ver`. Keep it in the service, not the controller.

### Public details + views (`apps/api/src/modules/properties/`)
- `views.service.ts` — `record(propertyId, userId|null, sessionId)`:
  1. Redis dedup key `view:dedup:{propertyId}:{userOrSession}:{YYYYMMDD}` — exists → return; else `SET … EX 129600` (36 h)
  2. Insert `propertyViews` row
  3. Fire-and-forget `UPDATE properties SET views = views + 1` (live counter; Phase 6 swaps to batched)
  4. `if (userId === property.ownerId) return` before any of the above.
- `public-properties.controller.ts`:
  - `GET /public/properties/:slugOrId` — ACTIVE only (404 otherwise), full public detail (all images by `ordering`, owner card, similar = same regionId + type, max 6, ACTIVE only), increments views (session id from `rz_sid` cookie; set the cookie in the same response when absent), `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`.
  - `GET /public/properties/:slugOrId/similar` — same similar query, no view increment, same cache header.
  - **Remove** `GET /public/properties` list (superseded by `/search/properties`; only consumer is the old rentals page, which is rewired). Keep `GET /public/locations` (wizard uses it).
  - Decorator order trap 6 applies: `@ApiTags` → `@Controller` → `@Public()` on the class.
- Verify BFF proxy forwards `Cache-Control` upstream→browser (it copies non-hop-by-hop headers; confirm in a manual curl test, add explicit passthrough if Express/Nest strips it).

### Favorites module (`apps/api/src/modules/favorites/`)
- `favorites.controller.ts`: `GET /favorites` (auth; SearchInput filters + sort over the user's favorites, hydrated as `PaginatedPropertyCards`), `POST /favorites/:propertyId` (idempotent — catch unique violation → 200), `DELETE /favorites/:propertyId`.
- `favorites.service.ts`: 404 if property not ACTIVE; own property → 404 for now (Phase 7 adds `CANNOT_FAVORITE_OWN`). Global throttle guard already applies (60–100/min per user — don't hard-code; tests assert limiting exists with `DISABLE_THROTTLE` unset for that case only).

### Phase 2 debt: flaky integration tests
- Per-test unique phones (shared helper incrementing counter) + `DISABLE_THROTTLE=true` in the integration vitest env setup for the register-heavy properties-flow specs (mechanism already exists per trap 2).

### Unit + integration tests (per §3)
- Unit: SearchInput parsing, cache-key determinism, view-dedup key math (day-boundary ±12 h window).
- Integration (PostGIS + Redis via compose): each filter independently + combos vs direct SQL counts; geo radius cross-checked vs raw `ST_DWithin`; bbox ≤500 + lean fields only; cache hit identical response <5 ms; view increments once per (property, session, day), owner view no-op; favorites idempotent POST + non-ACTIVE 404; anonymous access to search/details; owner email/phone absent from public details response.

## Web — `apps/web`

1. **`lib/server-api.ts`** (server components only): fetch `${INTERNAL_API_URL}/api/v1${path}`, `cache: 'no-store'` default, optional cookie forwarding (for authed RSC later). Rewire `rentals/page.tsx` (fixes the relative-fetch bug).
2. **React Query provider**: `components/providers/QueryProvider.tsx` (client) mounted in root layout. `QueryClient` created in a `useState`/lazy ref per SSR guidance.
3. **PropertyCard heart** (client island): react-query mutation `POST/DELETE /favorites/:id`, optimistic update; anonymous → `router.push('/login?next=' + pathname)` + store `sessionStorage['pendingFavorite']=propertyId`; details page replays it once after login. `data-fav` state for yellow heart (§22).
4. **`components/search/FilterDrawer.tsx`** — all §18 filters (city, district, type, price range, rooms, bedrooms, bathrooms, area, floor ≥, furnished, pets, smoking, verified). **No renovation.** Every filter writes its key into URL (`useSearchParams` + `router.push`), never local-only state (§63). Mobile: bottom sheet; desktop: side panel.
5. **`components/search/SortDropdown.tsx`**, **`Pagination.tsx`** (numbered), `EmptyState`/`Skeleton` reuse from `@rentuz/ui`.
6. **`rentals/page.tsx`** — RSC: read `searchParams` → `serverApi.get('/search/properties?…')`, render grid + FilterDrawer + Sort + Pagination + empty state. Suspense skeletons.
7. **`property/[slug]/page.tsx`** — per §20: desktop `Gallery | content + sticky owner card`; mobile single column, sticky bottom CTA. Sections: gallery + `Lightbox.tsx`, title/price/location, specs, amenities, description, small map, owner card (name, avatar, member-since, verified badge, "Xabarlash" button disabled → Phase 5), "Ijara so'rovi" disabled → Phase 4, `ShareButton.tsx` (`navigator.share` → clipboard fallback), "Saqlash" heart, similar 6. UUID param → `permanentRedirect` to slug. `not-found.tsx` with CTA to `/rentals`.
8. **`map/page.tsx`** + `components/map/MapView.tsx` (`@vis.gl/react-maplibre` 8.1.3 — already installed; single GeoJSON source, `cluster: true`, unclustered pins → `PropertyPreview` popup), `ListView.tsx` (synced hover↔marker), `RadiusControl.tsx` (km slider → `lat&lng&radius` URL params). URL holds `swLng/swLat/neLng/neLat/zoom` + type/price/verified; `onMoveend` → `router.replace` with new bbox → refetch `/search/map` (client fetch via BFF `api.get`). Truncated-at-500 → "Yaqinlashtiring" hint. **No geocoding on public map** (Nominatim is wizard-only).
9. **Home `page.tsx`** — 16 sections per §17, RSC + client islands (search bar, quick chips, lazy `MapDiscovery` — small map of 12 latest with coords). Data: `/search/cities`, `/search/featured`, `/search/properties?sort=newest&limit=12`. i18n keys per §1.7 into `messages/uz.json`.
10. **`favorites/page.tsx`** — `requireSession()`, grid via `/favorites` (same filters in URL), empty state "Hozircha saqlangan e'lonlar yo'q." + CTA.
11. **`FavoritesBadge`** in Navbar — react-query `useQuery(['favorites-count'])` polling 60 s + `refetchOnWindowFocus`.
12. **`ImagesStep` upload progress** (Phase 2 debt): replace sequential `fetch` with XHR (`onprogress`, abort button); keep max-15 guard and sequential order.
13. **`app/sitemap.ts` + `app/robots.ts`** — minimal (all ACTIVE property slugs + static routes; full SEO pass is Phase 8).

## E2E + CI

- `apps/web/e2e/` + `playwright.config.ts` (`@playwright/test@1.63.0` as `apps/web` devDep; chromium only). `webServer` boots api (`node dist/main.js`) + web (`next start`) against the compose stack; base URL `:3000`.
- 5 specs per §3: chip→rentals URL update; sort price_asc ordering; map drag → bbox URL + refetch; anonymous Saqlash → login redirect → preserved favorite; tenant Saqlash → toast → `/favorites` shows card.
- CI (`.github/workflows/ci.yml`): new `e2e` job after build — services `postgis/postgis:17-3.5` + `redis:7`, `pnpm install`, `turbo build`, migrate against service DB, seed, start api+web, `pnpm --filter web test:e2e`. Runs on PRs to `main` only (per 0_Phase §8).

## Verification order (AGENTS.md)

1. `pnpm lint` → 2. `pnpm typecheck` → 3. `pnpm test` → 4. `pnpm --filter api test:integration` (compose stack up; **0 flaky allowed**) → 5. `pnpm build` → 6. `pnpm --filter web test:e2e` → 7. boot gate (`node dist/main.js`: `/health` 200, `/ready` 200) + manual curl: search filters, cache hit, details + view counter, favorites idempotency, `Cache-Control` passthrough through BFF.
8. Lighthouse CLI on `/`, `/rentals`, `/map`, `/property/[slug]` ≥ 90 perf + a11y (record scores in walkthrough; not a CI gate). Mobile 375 px + desktop 1280 px screenshots of the same 4 pages.

## Docs updates (with the PR)

- `context/3_Phase.md`: mark tasks done; record the four deviations (Redis version-key instead of EventEmitter2, renovation dropped, numbered pagination only, `/public/properties` list endpoint removed).
- `context/0_Phase.md` §1: append new traps discovered (RSC relative-fetch bug + fix pattern; Playwright/CI specifics; any Nest/raw-SQL surprises).
- `walkthroughs/` → new dated `2026-09-…-phase-3-search-map-details-favorites.md` (task, files, verification table, remaining limitations) per AGENTS.md completion record.

## Risks / accepted limitations

- Edge cache (`s-maxage=60`) undercounts view increments (only cache MISSes hit the API) — accepted; Phase 6 batch rebuild reconciles from `propertyViews`.
- Sort drift SQL vs app: tests assert hydrated order matches requested sort.
- `priceUzs` is `BigInt` in Prisma — keep `Number()` coercion at the DTO boundary as PropertyCardDTO already does.
- Map at world zoom: bbox query is the cap (500) + truncated hint; no server-side denial.
- Home map discovery loads `maplibre-gl` (~heavy) — lazy island only, never in the RSC critical path.

## Task order

1. Branch + contracts + contract unit tests
2. Migration (indexes)
3. Search module (repository → cache → service → controller) + version bump wiring
4. Views service + public details/similar endpoints + `rz_sid` cookie
5. Favorites module (API)
6. `lib/server-api.ts` + rentals page rewire + react-query provider + heart/badge
7. FilterDrawer + SortDropdown + Pagination
8. Details page (gallery, lightbox, share, similar, 308 redirect, not-found)
9. Map page + MapView + preview/list/radius
10. Home 16 sections + i18n + MapDiscovery
11. Favorites page
12. Phase 2 debts: flaky tests, ImagesStep XHR progress
13. sitemap/robots
14. Playwright harness + 5 specs + CI job
15. Full verification gate + Lighthouse + screenshots
16. Docs: 3_Phase.md status/deviations, 0_Phase.md traps, walkthrough

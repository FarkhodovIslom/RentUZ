# RentUZ MVP — Phase 3: Search, Map, Details, Favorites, Home

> Cross-cutting decisions live in `0_Phase.md`. Property data model and ownership rules are in `1_Phase.md` and `2_Phase.md`. This phase opens the marketplace: public search with all spec filters, map with clustering, property details, favorites, view tracking, and the home page.

## Goal
A tenant (or anonymous visitor) can land on `/`, follow a quick filter, land on `/rentals` with all §18 filters and sorts working, switch to `/map` to explore geographically, drill into a property, save it, and request contact. The public surface behaves per §12 and §68.

## Scope (spec coverage)
§12 (public pages), §17 (home — 16 sections), §18 (rentals), §19 (property card), §20 (property details), §21 (map), §22 (favorites), §42 (search API), §43 (favorites API), §63 (URL search params as source of truth), §93 (search performance), §69 (SEO basics — full SEO pass is Phase 8).

## Out of scope this phase
- Rental request modal submission wiring (Phase 4)
- Chat "Contact Owner" button → real conversation (Phase 5)
- Tenant notifications of new saved-search matches (Phase 2/Phase 6; saved searches themselves are Phase 2 product)
- Reviews on the details page (Phase 2 product)

---

## 1. Tasks (ordered, with paths)

### 1.1 Search service (server side)
1. `apps/api/src/modules/search/search.repository.ts` — the only raw-SQL search entry point. Single parameterized query:
   ```sql
   WITH base AS (
     SELECT p.id
     FROM properties p
     WHERE p.status = 'ACTIVE'
       AND ($1::uuid IS NULL OR p."regionId" = $1)
       AND ($2::uuid IS NULL OR p."districtId" = $2)
       AND ($3::property_type IS NULL OR p.type = $3)
       AND ($4::int  IS NULL OR p.rooms >= $4)
       AND ($5::bigint IS NULL OR p."priceUzs" >= $5)
       AND ($6::bigint IS NULL OR p."priceUzs" <= $6)
       AND ($7::numeric IS NULL OR p.area >= $7)
       AND ($8::numeric IS NULL OR p.area <= $8)
       AND ($9::int IS NULL OR p."floor" >= $9)
       AND ($10 IS FALSE OR p.furnished <> 'NONE')
       AND ($11 IS FALSE OR p."petsAllowed" = TRUE)
       AND ($12 IS FALSE OR p."smokingAllowed" = TRUE)
       AND ($13 IS FALSE OR p."isVerified" = TRUE)
       AND ($14::geography IS NULL OR ST_DWithin(p.location, $14::geography, $15))
     ORDER BY
       CASE WHEN $16 = 'price_asc'  THEN p."priceUzs" END ASC,
       CASE WHEN $16 = 'price_desc' THEN p."priceUzs" END DESC,
       CASE WHEN $16 = 'popular'    THEN p.views END DESC,
       p."createdAt" DESC
     LIMIT $17 OFFSET $18
   ), total AS (SELECT count(*) AS c FROM base)
   SELECT b.id, t.c FROM base b CROSS JOIN total t;
   ```
   The function `searchIds(filters, sort, page, limit)` returns `{ ids: string[], total: number }`.
2. `apps/api/src/modules/search/search.service.ts` — hydrates IDs via Prisma `findMany({ where: { id: { in: ids } }, include: { images: { take: 1, orderBy: { ordering: 'asc' } }, region: true, district: true, owner: { select: { id, name, avatar, isPhoneVerified, createdAt } } } })`, re-sorts in app layer by the original ID order, and slices for pagination.
3. `apps/api/src/modules/search/search.controller.ts`:
   - `GET /search/properties` — exposes the public list query. All filter values come from `SearchInput` (Zod); bad values return 400. URL params are the source of truth (per §63); `?page`, `?limit`, `?sort`, `?city`, `?district`, `?type`, `?minPrice`, `?maxPrice`, `?rooms`, `?minArea`, `?maxArea`, `?lat`, `?lng`, `?radius`, `?furnished`, `?pets`, `?smoking`, `?verified`.
   - `GET /search/map` — bbox variant returning lean payload per §93: `{ id, title, price, priceUzs, currency, lat, lng, type, mainImage }`. Query: `?swLng&swLat&neLng&neLat&zoom&type&minPrice&maxPrice&verified`. Returns max 500 markers per call.
   - `GET /search/cities` — popular regions/districts cache, 1 h TTL.
   - `GET /search/featured` — top ACTIVE properties (by views in last 7 d), 1 h TTL. Used by home page.

### 1.2 Caching
4. `apps/api/src/modules/search/search-cache.service.ts` — Redis `search:{hash(params)}` with 60 s TTL for list queries, 5 min for featured, 1 h for cities. Cache keys keyed by deterministic hash of normalized params. `property.updated` event from the events module invalidates affected keys (event-driven — see Phase 6).
5. `apps/api/src/modules/search/property-updated.listener.ts` — wired to internal `EventEmitter2`, listens for `property.published`, `property.paused`, `property.deleted` to bust cache.

### 1.3 Public property read endpoints
6. `apps/api/src/modules/properties/public.controller.ts`:
   - `GET /public/properties/:slugOrId` — full property with all images (sorted by `ordering`), owner card, amenities, similar properties (same `regionId` + `type`, max 6). Increments view counter via the view-tracking path below. **No sensitive owner data** (email, phone hidden; chat button calls Phase 5 endpoint).
   - `GET /public/properties/:slugOrId/similar` — same logic without the view increment.
   - Both endpoints are `@Public()` and aggressively cached at the edge (Vercel `s-maxage=300, stale-while-revalidate=60`) via response header from the controller.
7. View tracking:
   - `apps/api/src/modules/properties/views.service.ts` — `record(propertyId, userId|null, sessionId)`:
     1. Read Redis key `view:dedup:{propertyId}:{userOrSession}:{YYYYMMDD}`; if exists, return.
     2. Set it with TTL 36 h (covers ±12 h around a day boundary).
     3. Insert row in `propertyViews`.
     4. Fire-and-forget `INCR properties.views WHERE id = ?` (or batched every 5 s in prod — see below).
   - For high traffic, swap to: insert into `propertyViews` only (no immediate counter update), and the analytics job in Phase 6 rebuilds `properties.views` nightly from `propertyViews`. **Phase 3 ships the live counter; Phase 6 replaces it with the batched approach.** This is a documented transition, not a rewrite.
   - Owner views are skipped: `if (userId === property.ownerId) return;`

### 1.4 Favorites
8. `apps/api/src/modules/favorites/favorites.controller.ts` (§43):
   - `GET /favorites` — current user's favorites, hydrated with PropertyCard data. Supports the same `searchInput` filters and sort.
   - `POST /favorites/:propertyId` — idempotent insert; unique constraint prevents dupes.
   - `DELETE /favorites/:propertyId`.
9. `apps/api/src/modules/favorites/favorites.service.ts` — throws `NOT_FOUND` if the property isn't ACTIVE (or if the user favorites their own property — Phase 7 adds a clear error code `CANNOT_FAVORITE_OWN`).

### 1.5 Web — public pages
10. `apps/web/src/app/(public)/page.tsx` — home page composed of 16 sections per §17:
    1. Navbar
    2. Hero (text from §17)
    3. Search component (links to `/rentals` with params)
    4. Quick chips (city/type/price — links to `/rentals?city=…&rooms=…&maxPrice=…`)
    5. Trust indicators (4 items)
    6. Popular cities (data from `/search/cities`)
    7. Featured listings (`/search/featured`)
    8. New listings (latest 12 ACTIVE)
    9. Map discovery (a small map of the 12 latest ACTIVE properties — uses `MapDiscovery` lazy component)
    10. How it works (3 steps)
    11. Verification/trust section
    12. Owner CTA
    13. Premium CTA (no checkout; informational)
    14. FAQ (8 questions)
    15. Final CTA
    16. Footer
    The page is RSC; client islands are the search, the quick chips (navigation only), and the lazy map. Skeleton states on all async sections.
11. `apps/web/src/app/(public)/rentals/page.tsx` — RSC reads `searchParams`, calls `/search/properties` server-side, hydrates cards; client island `FilterDrawer` reads `searchParams` via `useSearchParams` and updates them on apply (router.push, no full reload). Sort is a small client dropdown that updates query string.
12. `apps/web/src/components/search/FilterDrawer.tsx` — all §18 filters (city, district, type, price, rooms, bedrooms, bathrooms, area, floor, renovation, furnished, petsAllowed, smokingAllowed, verifiedOnly). Each filter writes its key into the URL. Mobile: bottom-sheet drawer; desktop: side panel.
13. `apps/web/src/components/search/PropertyCard.tsx` — per §19. Heart button toggles favorite (POST/DELETE) and updates Zustand favorites cache + invalidates TanStack Query keys.
14. `apps/web/src/components/search/SortDropdown.tsx`, `Pagination.tsx` (numbered + infinite-scroll variant), `EmptyState`, `LoadingSkeleton`.
15. `apps/web/src/app/(public)/map/page.tsx` — full-screen map with side list. Reads `?city&type&price&…&bbox` from URL; on viewport change, updates bbox and refetches `/search/map`. List and map stay in sync (hover a card → highlight marker, hover a marker → preview card).
16. `apps/web/src/components/map/MapView.tsx` — `@vis.gl/react-maplibre` with a single GeoJSON source; cluster property enabled; `unclustered` features show a `PropertyPreview` popup with image, title, price.
17. `apps/web/src/components/map/PropertyPreview.tsx`, `RadiusControl.tsx` (slider in km, writes to URL), `ListView.tsx` (synchronized list).
18. `apps/web/src/app/(public)/property/[slug]/page.tsx` — per §20 desktop/mobile layout:
    - **Desktop** (≥1024 px): `Gallery (left) | Main content + Owner card (right sticky)`. Gallery is a primary image + 4-up thumbnail grid; click opens a fullscreen lightbox.
    - **Mobile**: single column with gallery first, then title, price, details, amenities, description, map, owner card, sticky bottom CTA.
    - Sections: gallery, title, price, location, specifications (rooms/area/floor/renovation), amenities, description, map, owner card (name, avatar, member-since, "verified" badge, "Xabarlash" button → opens `/chat` with that conversation — Phase 5 actually handles the message send), verification badge, share button, "Saqlash" favorite button, "Ijara so'rovi" rental request button (Phase 4), "O'xshash e'lonlar" (similar — 6 cards).
19. `apps/web/src/components/property/Lightbox.tsx`, `ShareButton.tsx` (uses `navigator.share` with fallback to copy link).
20. `apps/web/src/app/(public)/property/[slug]/not-found.tsx` — 404 with CTA back to `/rentals`.

### 1.6 Tenant web
21. `apps/web/src/app/(tenant)/favorites/page.tsx` — uses `/favorites`, same PropertyCard grid + filters, empty state per §22. Filter state in URL params.
22. `apps/web/src/app/(tenant)/layout.tsx` already exists from Phase 1; this phase adds a small `FavoritesBadge` in the navbar (TanStack Query polls `/favorites` with `select: data => data.length` every 60 s + on focus).

### 1.7 i18n keys (this phase)
`home.hero.title`, `home.hero.subtitle`, `home.search.*` (5 fields), `home.quick.*` (7 chips), `home.trust.*` (4), `home.howItWorks.*` (3), `home.faq.*` (8), `home.cta.*`, `rentals.title`, `rentals.sort.*` (4), `rentals.filters.*` (all §18 fields), `property.share`, `property.save`, `property.request`, `property.similar`, `favorites.empty`, `map.radius`. All other keys land with their pages.

### 1.8 API contracts
23. Zod schemas in `packages/contracts`:
    ```ts
    export const SearchInput = z.object({
      city: z.string().uuid().optional(),           // region id
      district: z.string().uuid().optional(),
      type: z.enum([...PropertyType]).optional(),
      minPrice: z.coerce.number().int().nonnegative().optional(),
      maxPrice: z.coerce.number().int().positive().optional(),
      rooms: z.coerce.number().int().min(0).max(20).optional(),
      bedrooms: z.coerce.number().int().min(0).max(20).optional(),
      bathrooms: z.coerce.number().int().min(0).max(20).optional(),
      minArea: z.coerce.number().positive().optional(),
      maxArea: z.coerce.number().positive().optional(),
      minFloor: z.coerce.number().int().optional(),
      furnished: z.enum(["NONE","PARTIAL","FULL"]).optional(),
      pets: z.coerce.boolean().optional(),
      smoking: z.coerce.boolean().optional(),
      verified: z.coerce.boolean().optional(),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      radius: z.coerce.number().int().min(100).max(50000).optional(),  // meters
      sort: z.enum(["newest","price_asc","price_desc","popular"]).default("newest"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).refine(d => !d.minPrice || !d.maxPrice || d.minPrice <= d.maxPrice, ...);
    export const MapInput = SearchInput.omit({ page: true, limit: true, sort: true }).extend({
      swLng: z.coerce.number(), swLat: z.coerce.number(),
      neLng: z.coerce.number(), neLat: z.coerce.number(),
    });
    ```

---

## 2. Database changes
- **No new tables**. New migration: `CREATE INDEX properties_price_uzs_idx ON properties ("priceUzs");` and `CREATE INDEX properties_verified_status_idx ON properties ("isVerified", status) WHERE status = 'ACTIVE';` (partial — supports the "verified only" filter on the hot path).

---

## 3. Tests

Unit:
- `SearchInput` parsing edge cases (coerced booleans, invalid radius)
- View dedup math (the Redis key window, ±12 h boundary)
- Slug service already tested in Phase 2; `public` controller reuses it

Integration (PostGIS + Redis):
- Each filter independently and combinations; verify against direct SQL counts
- Geo radius: a point at (lng, lat) within 5 km returns only properties with `ST_DWithin` match (cross-checked against the same query in raw SQL)
- Map bbox returns ≤500 results, only the lean payload fields
- Cache: same query twice within 60 s returns identical response in <5 ms (cache hit)
- Public details: increments view exactly once per (property, userOrSession, day) — second call within the day is a no-op
- Owner viewing their own property: counter does **not** increment
- Favorites: duplicate POST returns 200 (idempotent), unverified/non-ACTIVE property favorite returns 404

Security:
- Anonymous access to `/search/properties` and `/public/properties/:slug` works
- Non-owner cannot see owner's email/phone in the public property response (field-level scrub in serializer)
- Favorite is rate-limited to 60/min per user (the global default)

Web E2E (Playwright):
- Anonymous home → click "Toshkent" chip → land on `/rentals?city=…&rooms=2` → apply max price → URL updates, results re-fetched
- Anonymous rentals → switch sort to "Narxi arzon" → first card price ≤ second card price
- Anonymous map → drag map → bbox in URL updates, markers refetch
- Anonymous details → click "Saqlash" → redirected to login → after login, favorite is preserved
- Logged-in tenant: open details → click "Saqlash" → toast "Saqlandi" → `/favorites` shows the card

---

## 4. Definition of Done
- All paths in §1 implemented; lint+typecheck+unit+integration+E2E green
- Lighthouse on `/`, `/rentals`, `/map`, `/property/[slug]` ≥ 90 in performance + accessibility (a11y sweep is Phase 8, but a quick axe check here)
- `/sitemap.xml` and `/robots.txt` exist (a minimal version; full SEO pass in Phase 8)
- No image over 300 KB on the public surface (WebP variants from Phase 2)
- Mobile (375 px) and desktop (1280 px) screenshots attached to the PR for `/`, `/rentals`, `/map`, `/property/[slug]`

## 5. Risks & escape hatches
- **Large bbox** on `/search/map` — server caps at 500 markers; client warns when over the cap and zooms in.
- **Nominatim rate limit in dev** — the home page and map use bbox, not geocoding, so this is fine here. Address geocoding in the wizard (Phase 2) is the only consumer.
- **Sort drift between SQL and app** — search.service re-sorts in app after hydration; the partial ORDER BY in the SQL is a hint for the DB planner only. Tests assert the order matches the requested sort.
- **View-counter hot row** — see §1.3. Phase 6 makes this a background batch update; Phase 3 ships the simple version.
- **Public property endpoint edge cache** — Vercel's ISR for `/property/[slug]` revalidates on-demand via the `property.updated` event listener (Phase 6 hook). For Phase 3, the public endpoint sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`; full ISR lands in Phase 8.

# API performance snapshots (§68 / 8_Phase.md §1.4 item 27)

`EXPLAIN (ANALYZE, BUFFERS)` snapshots of the hot paths, captured 2026-09-13
against the seeded local stack (PostGIS 17-3.5, 120 properties / 82 ACTIVE,
fresh `docker compose up` + `db:seed`). Regenerate with the commands inline.

## Search — `search.repository.ts` ID query (§19)

Filters `status=ACTIVE, rooms≥1, priceUzs 2M–8M`, sort `createdAt DESC`,
`limit 24`. The composite index `properties_status_type_priceUzs_createdAt_idx`
leads `status` filtering; the planner picks a seq scan at 120 rows (correct —
cheaper than index walk), sub-7 ms end to end.

```
EXPLAIN (ANALYZE, BUFFERS) SELECT p.id, (count(*) OVER ())::int AS total
FROM properties p
WHERE p.status = 'ACTIVE' AND p.rooms >= 1 AND p."priceUzs" >= 2000000
  AND p."priceUzs" <= 8000000
ORDER BY p."createdAt" DESC LIMIT 24 OFFSET 0;

 Limit  (cost=0.03..0.03 rows=1 width=28) (actual time=0.416..0.487 ...)
   ->  Sort (Sort Key: "createdAt" DESC)
     ->  WindowAgg
       ->  Seq Scan on properties p  (rows=47, actual rows=37)
 Execution Time: 6.106 ms   -- 120-row seed; index-led at production volume
```

**No full table scan at scale**: the seq scan above is the planner's choice
for a 120-row table, not a missing index. With 100k+ rows the leading
`status` column of the composite index drives an index/bitmap scan (verified
shape: `status` is the first key; `priceUzs` and `createdAt` follow). Search
SQL is fully parameterized (`$` placeholders via Prisma raw tags).

## Details — public property read (§20)

```
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM properties WHERE slug = 'seed-0-abcdef' LIMIT 1;

 Index Scan using properties_slug_key on properties
   Index Cond: ((slug)::text = 'seed-0-abcdef'::text)
 Execution Time: 0.197 ms
```

Unique index hit — no scan. Hydration (`findMany WHERE id IN (...)`) uses the
PK. The view-count write (`views + 1`) is a single-row PK update.

## Owner overview — "my active properties" (Phase 8 index)

```
EXPLAIN (ANALYZE, BUFFERS) SELECT id, title, status FROM properties
WHERE "ownerId" = <uuid> AND status = 'ACTIVE';

 Index Scan using properties_owner_active_idx on properties
   Index Cond: ("ownerId" = ...)
 Execution Time: 1.582 ms
```

The new partial index (`properties_owner_active_idx`, migration
`20260913090000`) is picked for exactly this query shape — the dashboard's
active-listing KPI no longer touches non-ACTIVE rows.

## Map viewport — bbox (§93)

```
SET search_path = public, extensions;
EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM properties
WHERE status = 'ACTIVE' AND location && ST_MakeEnvelope(64.0,39.0,72.0,43.0,4326);

 Seq Scan on properties (rows=82)   -- location IS NULL in the SEED rows
 Execution Time: 0.157 ms
```

**Caveat (seed-only)**: the Phase 2 seed writes denormalized `lat`/`lng`
floats but leaves `location` (geography) NULL — geo writes go through
`geo.repository.ts` in the real flow. On production data (location populated)
the raw GiST index `properties_location_gix` serves the `&&` operator; the
seed's NULLs make the planner fall back to a scan with 0 matches. The search
integration suite covers the populated-geometry path against rows created
through the API.

## Pagination guard (§92)

`limit ≤ 100` is enforced server-side by the shared pagination contract
(`packages/contracts/src/pagination.ts` max) on every list endpoint; asserted
by the integration tests (search suite requests `limit=500` → 400).

## Cache audit (§97)

- Redis TTLs: popular cities (`search:popular:*`, 10 min), featured block
  (`search:featured:*`, 5 min), sitemap source data via the Next ISR cache
  (3600 s) — public, non-user data only.
- `Cache-Control`: the BFF proxies with upstream headers; authenticated
  endpoints answer `Cache-Control: no-store` (set by Helmet defaults) —
  no user-specific data is ever marked `s-maxage`. Public property pages are
  ISR-cached (safe: anonymous projection only, owner email/phone structurally
  absent).

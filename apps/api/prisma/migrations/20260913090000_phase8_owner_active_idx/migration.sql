-- Phase 8 (8_Phase.md §2): owner dashboard partial index.
-- search_path must include the extensions schema (0_Phase.md §1 trap 3).
SET search_path = public, extensions;

-- Supports the "my active properties" query in the owner dashboard (§2).
-- Partial index — invisible to the Prisma schema, declared raw on purpose
-- (same pattern as rental_requests_pending_uniq).
CREATE INDEX IF NOT EXISTS "properties_owner_active_idx" ON "properties" ("ownerId") WHERE status = 'ACTIVE';

-- prisma migrate dev re-drops the raw PostGIS GIST index (it is invisible to
-- the schema because `location` is Unsupported — 0_Phase.md trap 3/18).
-- Restore the index created in auth_core; harmless no-op when it already exists.
CREATE INDEX IF NOT EXISTS "properties_location_gix" ON "properties" USING GIST ("location");

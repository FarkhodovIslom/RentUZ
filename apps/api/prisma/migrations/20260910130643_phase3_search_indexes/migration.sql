-- Phase 3 search indexes (3_Phase.md §2). Header per 0_Phase.md §1 trap 3
-- (consistency with auth_core; no geo types touched here).
SET search_path = public, extensions;

-- CreateIndex (declared in schema.prisma)
CREATE INDEX "properties_priceUzs_idx" ON "properties"("priceUzs");

-- Partial index for the "verified only" filter on the hot path — raw SQL
-- because Prisma cannot express partial indexes (auth_core precedent).
CREATE INDEX "properties_verified_status_idx" ON "properties" ("isVerified", status) WHERE status = 'ACTIVE';

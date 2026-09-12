-- Phase 5 §2: messages cursor pagination index (5_Phase.md).
SET search_path = public, extensions;

-- DropIndex
DROP INDEX "messages_conversationId_createdAt_idx";

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_id_idx" ON "messages"("conversationId", "createdAt", "id");

-- Prisma emitted a DROP of the raw PostGIS GIST index below (it is invisible
-- to the schema because `location` is Unsupported — 0_Phase.md trap 3). It
-- must survive: restore the index created in auth_core, undeclared on purpose.
CREATE INDEX IF NOT EXISTS "properties_location_gix" ON "properties" USING GIST ("location");

-- The `extensions` schema mirrors Supabase's layout so dev and prod share one
-- search_path (`public,extensions`). PostGIS itself is created by the first
-- Prisma migration so the Prisma shadow database gets it too.
CREATE SCHEMA IF NOT EXISTS extensions;

-- Phase 7 (7_Phase.md §2): admin moderation migration.
-- search_path must include the extensions schema (0_Phase.md §1 trap 3).
SET search_path = public, extensions;

-- §1.3: CRITICAL is reserved for admin escalation of reports.
ALTER TYPE "ReportPriority" ADD VALUE IF NOT EXISTS 'CRITICAL';

-- verification.info_requested → owner notification (7_Phase.md §1.2 item 7).
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'VERIFICATION_INFO_REQUESTED';

-- §5 "Reactivation side-effects": tracks WHY a property was paused so
-- activation only restores OWNER_SUSPENDED-paused rows. TS-level union
-- ('OWNER_SUSPENDED' | 'ADMIN' | 'OWNER'), not a PG enum.
ALTER TABLE "properties" ADD COLUMN "pausedReason" TEXT;

-- Dedup check + per-target reports list (§2).
CREATE INDEX IF NOT EXISTS "reports_target_idx" ON "reports" ("targetType","targetId","status");

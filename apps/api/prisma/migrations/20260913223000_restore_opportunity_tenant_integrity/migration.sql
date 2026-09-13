-- Restore tenant-aware integrity constraints accidentally weakened by the RBAC migration.

ALTER TABLE "opportunities"
  DROP CONSTRAINT IF EXISTS "opportunities_pipeline_id_fkey",
  DROP CONSTRAINT IF EXISTS "opportunities_stage_id_fkey",
  DROP CONSTRAINT IF EXISTS "opportunities_company_id_fkey",
  DROP CONSTRAINT IF EXISTS "opportunities_contact_id_fkey";

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "opportunities_contact_org_fkey"
  FOREIGN KEY ("contact_id", "organization_id")
  REFERENCES "contacts"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "opportunities_pipeline_org_fkey"
  FOREIGN KEY ("pipeline_id", "organization_id")
  REFERENCES "pipelines"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "opportunities_stage_org_pipeline_fkey"
  FOREIGN KEY ("stage_id", "organization_id", "pipeline_id")
  REFERENCES "pipeline_stages"("id", "organization_id", "pipeline_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "opportunities_owner_membership_fkey"
  FOREIGN KEY ("organization_id", "owner_user_id")
  REFERENCES "organization_memberships"("organization_id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "organization_memberships"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

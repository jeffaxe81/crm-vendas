-- C3.6.1: tenant-aware commercial opportunity foundation.

CREATE TABLE "opportunities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "pipeline_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "company_id" UUID,
  "contact_id" UUID,
  "owner_user_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "estimated_value" DECIMAL(19,2) NOT NULL,
  "expected_close_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opportunities_customer_xor_check" CHECK (
    ("company_id" IS NOT NULL AND "contact_id" IS NULL)
    OR
    ("company_id" IS NULL AND "contact_id" IS NOT NULL)
  ),
  CONSTRAINT "opportunities_estimated_value_check" CHECK ("estimated_value" >= 0)
);

CREATE UNIQUE INDEX "companies_id_organization_key"
  ON "companies"("id", "organization_id");
CREATE UNIQUE INDEX "contacts_id_organization_key"
  ON "contacts"("id", "organization_id");
CREATE UNIQUE INDEX "pipeline_stages_id_org_pipeline_key"
  ON "pipeline_stages"("id", "organization_id", "pipeline_id");

CREATE INDEX "opportunities_org_deleted_stage_close_idx"
  ON "opportunities"("organization_id", "deleted_at", "stage_id", "expected_close_at");
CREATE INDEX "opportunities_org_owner_deleted_close_idx"
  ON "opportunities"("organization_id", "owner_user_id", "deleted_at", "expected_close_at");
CREATE INDEX "opportunities_org_company_deleted_idx"
  ON "opportunities"("organization_id", "company_id", "deleted_at");
CREATE INDEX "opportunities_org_contact_deleted_idx"
  ON "opportunities"("organization_id", "contact_id", "deleted_at");
CREATE INDEX "opportunities_org_pipeline_stage_deleted_idx"
  ON "opportunities"("organization_id", "pipeline_id", "stage_id", "deleted_at");

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_contact_org_fkey"
  FOREIGN KEY ("contact_id", "organization_id")
  REFERENCES "contacts"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_pipeline_org_fkey"
  FOREIGN KEY ("pipeline_id", "organization_id")
  REFERENCES "pipelines"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_stage_org_pipeline_fkey"
  FOREIGN KEY ("stage_id", "organization_id", "pipeline_id")
  REFERENCES "pipeline_stages"("id", "organization_id", "pipeline_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_owner_membership_fkey"
  FOREIGN KEY ("organization_id", "owner_user_id")
  REFERENCES "organization_memberships"("organization_id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" FORCE ROW LEVEL SECURITY;

CREATE POLICY "opportunities_tenant_isolation"
ON "opportunities"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

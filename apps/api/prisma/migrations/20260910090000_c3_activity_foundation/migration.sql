-- C3.5.1: tenant-aware commercial activity foundation.

CREATE TYPE "activity_type" AS ENUM ('TASK', 'APPOINTMENT');
CREATE TYPE "activity_status" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "activity_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "type" "activity_type" NOT NULL,
  "status" "activity_status" NOT NULL DEFAULT 'PENDING',
  "priority" "activity_priority" NOT NULL DEFAULT 'MEDIUM',
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "company_id" UUID,
  "contact_id" UUID,
  "owner_user_id" UUID NOT NULL,
  "due_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activities_org_status_due_idx"
  ON "activities"("organization_id", "status", "due_at");
CREATE INDEX "activities_org_owner_status_due_idx"
  ON "activities"("organization_id", "owner_user_id", "status", "due_at");
CREATE INDEX "activities_org_company_idx"
  ON "activities"("organization_id", "company_id");
CREATE INDEX "activities_org_contact_idx"
  ON "activities"("organization_id", "contact_id");

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;

CREATE POLICY "activities_tenant_isolation"
ON "activities"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

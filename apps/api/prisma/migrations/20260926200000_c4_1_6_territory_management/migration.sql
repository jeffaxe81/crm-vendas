-- C4.1.6: territory management (territories, quotas, coverage targets, metrics).
-- Tenant isolation follows the existing pattern: FORCE RLS keyed on
-- app.current_organization_id and composite (id, organization_id) FKs.

CREATE TYPE "territory_quota_period" AS ENUM ('MONTH', 'QUARTER', 'YEAR');
CREATE TYPE "territory_coverage_status" AS ENUM ('UNCOVERED', 'PARTIAL', 'COVERED');

CREATE TABLE "territories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "region" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "sales_rep_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "territories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "territories_name_not_blank_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "territories_region_not_blank_check" CHECK (length(btrim("region")) > 0)
);

CREATE UNIQUE INDEX "territories_id_organization_key"
  ON "territories"("id", "organization_id");
CREATE INDEX "territories_org_deleted_name_idx"
  ON "territories"("organization_id", "deleted_at", "name");
CREATE INDEX "territories_org_region_idx"
  ON "territories"("organization_id", "region");

ALTER TABLE "territories"
  ADD CONSTRAINT "territories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territories"
  ADD CONSTRAINT "territories_sales_rep_id_fkey"
  FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territories"
  ADD CONSTRAINT "territories_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territories"
  ADD CONSTRAINT "territories_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territories"
  ADD CONSTRAINT "territories_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territories" FORCE ROW LEVEL SECURITY;

CREATE POLICY "territories_tenant_isolation"
ON "territories"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

CREATE TABLE "territory_quotas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "territory_id" UUID NOT NULL,
  "period" "territory_quota_period" NOT NULL,
  "year" INTEGER NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "actual" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "territory_quotas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "territory_quotas_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "territory_quotas_actual_check" CHECK ("actual" >= 0),
  CONSTRAINT "territory_quotas_year_check" CHECK ("year" BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX "territory_quotas_territory_period_year_key"
  ON "territory_quotas"("territory_id", "period", "year");
CREATE INDEX "territory_quotas_org_territory_idx"
  ON "territory_quotas"("organization_id", "territory_id");

ALTER TABLE "territory_quotas"
  ADD CONSTRAINT "territory_quotas_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territory_quotas"
  ADD CONSTRAINT "territory_quotas_territory_org_fkey"
  FOREIGN KEY ("territory_id", "organization_id")
  REFERENCES "territories"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territory_quotas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territory_quotas" FORCE ROW LEVEL SECURITY;

CREATE POLICY "territory_quotas_tenant_isolation"
ON "territory_quotas"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

CREATE TABLE "territory_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "territory_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "coverage_status" "territory_coverage_status" NOT NULL DEFAULT 'UNCOVERED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "territory_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "territory_targets_territory_company_key"
  ON "territory_targets"("territory_id", "company_id");
CREATE INDEX "territory_targets_org_territory_status_idx"
  ON "territory_targets"("organization_id", "territory_id", "coverage_status");

ALTER TABLE "territory_targets"
  ADD CONSTRAINT "territory_targets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territory_targets"
  ADD CONSTRAINT "territory_targets_territory_org_fkey"
  FOREIGN KEY ("territory_id", "organization_id")
  REFERENCES "territories"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territory_targets"
  ADD CONSTRAINT "territory_targets_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territory_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territory_targets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "territory_targets_tenant_isolation"
ON "territory_targets"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

CREATE TABLE "territory_metrics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "territory_id" UUID NOT NULL,
  "coverage_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "quota_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "actual_revenue" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "target_count" INTEGER NOT NULL DEFAULT 0,
  "covered_count" INTEGER NOT NULL DEFAULT 0,
  "last_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "territory_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "territory_metrics_territory_id_key" UNIQUE ("territory_id")
);

ALTER TABLE "territory_metrics"
  ADD CONSTRAINT "territory_metrics_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territory_metrics"
  ADD CONSTRAINT "territory_metrics_territory_org_fkey"
  FOREIGN KEY ("territory_id", "organization_id")
  REFERENCES "territories"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territory_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territory_metrics" FORCE ROW LEVEL SECURITY;

CREATE POLICY "territory_metrics_tenant_isolation"
ON "territory_metrics"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

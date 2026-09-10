-- Cycle 3.4: tenant-aware sales pipeline and ordered stage foundation.

CREATE TYPE "pipeline_stage_kind" AS ENUM ('OPEN', 'WON', 'LOST');

CREATE TABLE "pipelines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "normalized_name" VARCHAR(160) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_stages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "pipeline_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" "pipeline_stage_kind" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_stages_position_check" CHECK ("position" > 0)
);

CREATE UNIQUE INDEX "pipelines_org_normalized_name_key"
  ON "pipelines"("organization_id", "normalized_name");
CREATE UNIQUE INDEX "pipelines_id_organization_key"
  ON "pipelines"("id", "organization_id");
CREATE INDEX "pipelines_org_active_idx"
  ON "pipelines"("organization_id", "is_active");
CREATE UNIQUE INDEX "pipeline_stages_pipeline_position_key"
  ON "pipeline_stages"("pipeline_id", "position");
CREATE INDEX "pipeline_stages_org_pipeline_active_idx"
  ON "pipeline_stages"("organization_id", "pipeline_id", "is_active");

ALTER TABLE "pipelines"
  ADD CONSTRAINT "pipelines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pipeline_stages"
  ADD CONSTRAINT "pipeline_stages_pipeline_org_fkey"
  FOREIGN KEY ("pipeline_id", "organization_id")
  REFERENCES "pipelines"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipelines" FORCE ROW LEVEL SECURITY;

CREATE POLICY "pipelines_tenant_isolation"
ON "pipelines"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_stages" FORCE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_tenant_isolation"
ON "pipeline_stages"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

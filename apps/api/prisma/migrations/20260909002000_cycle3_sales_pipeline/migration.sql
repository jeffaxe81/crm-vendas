-- Cycle 3 — Sales Pipeline

CREATE TYPE "opportunity_status" AS ENUM ('OPEN', 'WON', 'LOST');

CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipeline_stages_position_check" CHECK ("position" >= 0),
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "estimated_value" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "expected_close_date" DATE,
    "status" "opportunity_status" NOT NULL DEFAULT 'OPEN',
    "loss_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "opportunities_estimated_value_check" CHECK ("estimated_value" >= 0),
    CONSTRAINT "opportunities_loss_reason_check" CHECK ("status" = 'LOST' OR "loss_reason" IS NULL),
    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opportunity_stage_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pipelines_org_active_idx" ON "pipelines"("organization_id", "is_active");
CREATE INDEX "pipelines_org_default_active_idx" ON "pipelines"("organization_id", "is_default", "is_active");
CREATE UNIQUE INDEX "pipelines_org_default_key" ON "pipelines"("organization_id") WHERE "is_default" = true AND "is_active" = true;

CREATE UNIQUE INDEX "pipeline_stages_pipeline_position_key" ON "pipeline_stages"("pipeline_id", "position");
CREATE INDEX "pipeline_stages_org_pipeline_active_position_idx" ON "pipeline_stages"("organization_id", "pipeline_id", "is_active", "position");

CREATE INDEX "opportunities_org_status_stage_idx" ON "opportunities"("organization_id", "status", "stage_id");
CREATE INDEX "opportunities_org_pipeline_status_idx" ON "opportunities"("organization_id", "pipeline_id", "status");
CREATE INDEX "opportunities_org_company_idx" ON "opportunities"("organization_id", "company_id");
CREATE INDEX "opportunities_org_contact_idx" ON "opportunities"("organization_id", "contact_id");
CREATE INDEX "opportunities_org_owner_status_idx" ON "opportunities"("organization_id", "owner_user_id", "status");

CREATE INDEX "opportunity_stage_history_org_opportunity_occurred_idx" ON "opportunity_stage_history"("organization_id", "opportunity_id", "occurred_at");
CREATE INDEX "opportunity_stage_history_org_actor_occurred_idx" ON "opportunity_stage_history"("organization_id", "actor_user_id", "occurred_at");

ALTER TABLE "pipelines"
    ADD CONSTRAINT "pipelines_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey"
    FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_pipeline_id_fkey"
    FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunity_stage_history"
    ADD CONSTRAINT "opportunity_stage_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_history"
    ADD CONSTRAINT "opportunity_stage_history_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_history"
    ADD CONSTRAINT "opportunity_stage_history_from_stage_id_fkey"
    FOREIGN KEY ("from_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_history"
    ADD CONSTRAINT "opportunity_stage_history_to_stage_id_fkey"
    FOREIGN KEY ("to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_history"
    ADD CONSTRAINT "opportunity_stage_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

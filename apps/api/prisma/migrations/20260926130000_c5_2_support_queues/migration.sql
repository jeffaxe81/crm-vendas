-- C5.2: support queues and optional ticket queue with auto-assignment flag.

CREATE TABLE "support_queues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "auto_assign" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "support_queues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_queues_name_not_blank_check" CHECK (length(btrim("name")) > 0)
);

CREATE UNIQUE INDEX "support_queues_id_organization_key"
  ON "support_queues"("id", "organization_id");
-- Name is unique per tenant, case-insensitive, among non-deleted queues.
CREATE UNIQUE INDEX "support_queues_org_name_active_key"
  ON "support_queues"("organization_id", lower("name"))
  WHERE "deleted_at" IS NULL;
CREATE INDEX "support_queues_org_deleted_active_idx"
  ON "support_queues"("organization_id", "deleted_at", "is_active");

ALTER TABLE "support_queues"
  ADD CONSTRAINT "support_queues_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_queues"
  ADD CONSTRAINT "support_queues_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_queues"
  ADD CONSTRAINT "support_queues_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_queues"
  ADD CONSTRAINT "support_queues_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_queues" FORCE ROW LEVEL SECURITY;
CREATE POLICY "support_queues_tenant_isolation"
ON "support_queues"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

ALTER TABLE "tickets" ADD COLUMN "queue_id" UUID;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_queue_org_fkey"
  FOREIGN KEY ("queue_id", "organization_id")
  REFERENCES "support_queues"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tickets_org_queue_status_idx"
  ON "tickets"("organization_id", "queue_id", "deleted_at", "status");

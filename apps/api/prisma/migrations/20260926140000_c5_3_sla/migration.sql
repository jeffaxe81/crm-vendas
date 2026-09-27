-- C5.3: SLA policies per priority and ticket deadlines (calendar minutes, 24x7).

CREATE TABLE "sla_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "priority" "ticket_priority" NOT NULL,
  "first_response_minutes" INTEGER NOT NULL,
  "resolution_minutes" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sla_policies_first_response_minutes_check" CHECK ("first_response_minutes" > 0),
  CONSTRAINT "sla_policies_resolution_minutes_check" CHECK ("resolution_minutes" > 0),
  CONSTRAINT "sla_policies_resolution_after_first_response_check"
    CHECK ("resolution_minutes" >= "first_response_minutes")
);

CREATE UNIQUE INDEX "sla_policies_org_priority_key"
  ON "sla_policies"("organization_id", "priority");

ALTER TABLE "sla_policies"
  ADD CONSTRAINT "sla_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sla_policies"
  ADD CONSTRAINT "sla_policies_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sla_policies"
  ADD CONSTRAINT "sla_policies_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sla_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sla_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sla_policies_tenant_isolation"
ON "sla_policies"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- Ticket deadlines: null when no active policy existed for the priority.
ALTER TABLE "tickets" ADD COLUMN "first_response_due_at" TIMESTAMPTZ(6);
ALTER TABLE "tickets" ADD COLUMN "resolution_due_at" TIMESTAMPTZ(6);


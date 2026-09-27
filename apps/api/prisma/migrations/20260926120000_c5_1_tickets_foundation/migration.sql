-- C5.1: service tickets with per-organization yearly protocol and timeline.

CREATE TYPE "ticket_status" AS ENUM (
  'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED'
);
CREATE TYPE "ticket_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "ticket_channel" AS ENUM (
  'PHONE', 'EMAIL', 'WHATSAPP', 'WEB', 'IN_PERSON', 'OTHER'
);
CREATE TYPE "ticket_event_type" AS ENUM (
  'CREATED', 'COMMENT', 'STATUS_CHANGED', 'ASSIGNED', 'UPDATED'
);

CREATE TABLE "ticket_protocol_counters" (
  "organization_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "last_value" INTEGER NOT NULL,
  CONSTRAINT "ticket_protocol_counters_pkey" PRIMARY KEY ("organization_id", "year"),
  CONSTRAINT "ticket_protocol_counters_last_value_check" CHECK ("last_value" > 0)
);

ALTER TABLE "ticket_protocol_counters"
  ADD CONSTRAINT "ticket_protocol_counters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tickets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "protocol" VARCHAR(20) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
  "priority" "ticket_priority" NOT NULL DEFAULT 'MEDIUM',
  "channel" "ticket_channel" NOT NULL DEFAULT 'OTHER',
  "company_id" UUID,
  "contact_id" UUID,
  "assignee_user_id" UUID,
  "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "first_response_at" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tickets_subject_not_blank_check" CHECK (length(btrim("subject")) > 0),
  CONSTRAINT "tickets_protocol_format_check" CHECK ("protocol" ~ '^[0-9]{4}-[0-9]{6,}$')
);

CREATE UNIQUE INDEX "tickets_id_organization_key"
  ON "tickets"("id", "organization_id");
CREATE UNIQUE INDEX "tickets_org_protocol_key"
  ON "tickets"("organization_id", "protocol");
CREATE INDEX "tickets_org_deleted_status_priority_idx"
  ON "tickets"("organization_id", "deleted_at", "status", "priority");
CREATE INDEX "tickets_org_assignee_status_idx"
  ON "tickets"("organization_id", "assignee_user_id", "deleted_at", "status");
CREATE INDEX "tickets_org_company_deleted_idx"
  ON "tickets"("organization_id", "company_id", "deleted_at");
CREATE INDEX "tickets_org_contact_deleted_idx"
  ON "tickets"("organization_id", "contact_id", "deleted_at");

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_contact_org_fkey"
  FOREIGN KEY ("contact_id", "organization_id")
  REFERENCES "contacts"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_assignee_membership_fkey"
  FOREIGN KEY ("organization_id", "assignee_user_id")
  REFERENCES "organization_memberships"("organization_id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ticket_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "type" "ticket_event_type" NOT NULL,
  "body" TEXT,
  "is_internal" BOOLEAN NOT NULL DEFAULT false,
  "from_status" "ticket_status",
  "to_status" "ticket_status",
  "metadata" JSONB,
  "author_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_events_org_ticket_created_idx"
  ON "ticket_events"("organization_id", "ticket_id", "created_at");

ALTER TABLE "ticket_events"
  ADD CONSTRAINT "ticket_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_events"
  ADD CONSTRAINT "ticket_events_ticket_org_fkey"
  FOREIGN KEY ("ticket_id", "organization_id")
  REFERENCES "tickets"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_events"
  ADD CONSTRAINT "ticket_events_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Timeline is append-only for the runtime role.
CREATE FUNCTION "ticket_events_forbid_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket_events is append-only';
END;
$$;

CREATE TRIGGER "ticket_events_append_only"
BEFORE UPDATE ON "ticket_events"
FOR EACH ROW EXECUTE FUNCTION "ticket_events_forbid_mutation"();

ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tickets_tenant_isolation"
ON "tickets"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

ALTER TABLE "ticket_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ticket_events_tenant_isolation"
ON "ticket_events"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

ALTER TABLE "ticket_protocol_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_protocol_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ticket_protocol_counters_tenant_isolation"
ON "ticket_protocol_counters"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- F4.3-02: encrypted, tenant-scoped and deduplicated outbound email queue.
CREATE TABLE "email_outbox" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "idempotency_hash" VARCHAR(64) NOT NULL,
  "purpose" VARCHAR(32) NOT NULL,
  "encrypted_email" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "lease_token" UUID,
  "leased_until" TIMESTAMPTZ(6),
  "provider_message_id" VARCHAR(200),
  "last_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_outbox_purpose_check"
    CHECK ("purpose" IN ('SLA_DUE_SOON','SATISFACTION_REQUEST')),
  CONSTRAINT "email_outbox_status_check"
    CHECK ("status" IN ('PENDING','PROCESSING','RETRY_SCHEDULED','ACCEPTED','EXHAUSTED','CANCELLED')),
  CONSTRAINT "email_outbox_attempt_check" CHECK ("attempt_count" BETWEEN 0 AND 5),
  CONSTRAINT "email_outbox_lease_check"
    CHECK (("lease_token" IS NULL) = ("leased_until" IS NULL)),
  CONSTRAINT "email_outbox_provider_check"
    CHECK ("provider_message_id" IS NULL OR "status" = 'ACCEPTED'),
  CONSTRAINT "email_outbox_hash_check"
    CHECK ("idempotency_hash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "email_outbox_org_idempotency_key"
  ON "email_outbox" ("organization_id", "idempotency_hash");
CREATE INDEX "email_outbox_org_due_idx"
  ON "email_outbox" ("organization_id", "status", "next_attempt_at", "leased_until");
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_ticket_org_fkey"
  FOREIGN KEY ("ticket_id", "organization_id") REFERENCES "tickets"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY email_outbox_tenant_isolation ON public.email_outbox
  USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

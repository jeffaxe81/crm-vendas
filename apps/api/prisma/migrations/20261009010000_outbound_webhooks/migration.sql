CREATE TABLE "webhook_subscriptions" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL, "target_url" VARCHAR(2048) NOT NULL,
  "event_types" VARCHAR(64)[] NOT NULL, "encrypted_secret" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_subscriptions_version_check" CHECK ("version" > 0),
  CONSTRAINT "webhook_subscriptions_events_check" CHECK (cardinality("event_types") BETWEEN 1 AND 4 AND
    "event_types" <@ ARRAY['company.created','opportunity.won','opportunity.lost','ticket.closed']::varchar(64)[])
);
CREATE TABLE "webhook_dispatches" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "subscription_id" UUID NOT NULL,
  "subscription_version" INTEGER NOT NULL, "event_id" UUID NOT NULL, "event_type" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL, "target_url" VARCHAR(2048) NOT NULL, "encrypted_secret" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING', "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "lease_token" UUID, "locked_until" TIMESTAMPTZ(6), "request_id" VARCHAR(160) NOT NULL,
  "last_error_code" VARCHAR(80), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_dispatches_status_check" CHECK ("status" IN ('PENDING','PROCESSING','RETRY_SCHEDULED','DELIVERED','EXHAUSTED','CANCELLED')),
  CONSTRAINT "webhook_dispatches_attempt_check" CHECK ("attempt_count" BETWEEN 0 AND 5),
  CONSTRAINT "webhook_dispatches_version_check" CHECK ("subscription_version" > 0),
  CONSTRAINT "webhook_dispatches_event_check" CHECK ("event_type" IN ('company.created','opportunity.won','opportunity.lost','ticket.closed','webhook.test')),
  CONSTRAINT "webhook_dispatches_lease_check" CHECK (("lease_token" IS NULL) = ("locked_until" IS NULL))
);
CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "subscription_id" UUID NOT NULL,
  "dispatch_id" UUID NOT NULL, "attempt" INTEGER NOT NULL, "status" VARCHAR(16) NOT NULL,
  "response_status" INTEGER, "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_deliveries_attempt_check" CHECK ("attempt" BETWEEN 1 AND 5),
  CONSTRAINT "webhook_deliveries_status_check" CHECK ("status" IN ('DELIVERED','FAILED')),
  CONSTRAINT "webhook_deliveries_response_check" CHECK ("response_status" IS NULL OR "response_status" BETWEEN 100 AND 599),
  CONSTRAINT "webhook_deliveries_result_check" CHECK (("status" = 'DELIVERED' AND "response_status" BETWEEN 200 AND 299 AND "response_status" IS NOT NULL AND "error_code" IS NULL) OR ("status" = 'FAILED' AND "error_code" IS NOT NULL))
);
CREATE UNIQUE INDEX "webhook_subscriptions_id_org_key" ON "webhook_subscriptions" ("id", "organization_id");
CREATE INDEX "webhook_subscriptions_org_active_idx" ON "webhook_subscriptions" ("organization_id", "is_active");
CREATE UNIQUE INDEX "webhook_dispatches_id_subscription_org_key" ON "webhook_dispatches" ("id", "subscription_id", "organization_id");
CREATE UNIQUE INDEX "webhook_dispatches_subscription_event_org_key" ON "webhook_dispatches" ("subscription_id", "event_id", "organization_id");
CREATE INDEX "webhook_dispatches_org_pending_idx" ON "webhook_dispatches" ("organization_id", "status", "next_attempt_at", "locked_until");
CREATE INDEX "webhook_dispatches_org_subscription_created_idx" ON "webhook_dispatches" ("organization_id", "subscription_id", "created_at");
CREATE UNIQUE INDEX "webhook_deliveries_dispatch_attempt_org_key" ON "webhook_deliveries" ("dispatch_id", "attempt", "organization_id");
CREATE INDEX "webhook_deliveries_org_subscription_created_idx" ON "webhook_deliveries" ("organization_id", "subscription_id", "created_at");
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_subscription_fkey" FOREIGN KEY ("subscription_id", "organization_id") REFERENCES "webhook_subscriptions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_fkey" FOREIGN KEY ("subscription_id", "organization_id") REFERENCES "webhook_subscriptions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_dispatch_fkey" FOREIGN KEY ("dispatch_id", "subscription_id", "organization_id") REFERENCES "webhook_dispatches"("id", "subscription_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_subscriptions_tenant_isolation ON public.webhook_subscriptions USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();
ALTER TABLE public.webhook_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dispatches FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_dispatches_tenant_isolation ON public.webhook_dispatches USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_dispatches FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant_isolation ON public.webhook_deliveries USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();
CREATE FUNCTION public.crm_webhook_delivery_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'webhook delivery attempts are immutable' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER webhook_delivery_immutable BEFORE UPDATE OR DELETE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.crm_webhook_delivery_immutable();

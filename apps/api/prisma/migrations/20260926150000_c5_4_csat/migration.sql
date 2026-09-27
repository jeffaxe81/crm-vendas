-- C5.4: customer satisfaction (CSAT) survey, one per ticket, created on the
-- first transition to RESOLVED. Only the SHA-256 hash of the customer token
-- is stored.

CREATE TABLE "ticket_satisfaction_surveys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "rating" SMALLINT,
  "comment" TEXT,
  "responded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ticket_satisfaction_surveys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_satisfaction_surveys_rating_check"
    CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
  CONSTRAINT "ticket_satisfaction_surveys_comment_length_check"
    CHECK ("comment" IS NULL OR char_length("comment") <= 2000),
  CONSTRAINT "ticket_satisfaction_surveys_response_check"
    CHECK (("rating" IS NULL) = ("responded_at" IS NULL)),
  CONSTRAINT "ticket_satisfaction_surveys_token_hash_format_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ticket_satisfaction_surveys_id_organization_key"
  ON "ticket_satisfaction_surveys"("id", "organization_id");
CREATE UNIQUE INDEX "ticket_satisfaction_surveys_ticket_org_key"
  ON "ticket_satisfaction_surveys"("ticket_id", "organization_id");
CREATE UNIQUE INDEX "ticket_satisfaction_surveys_token_hash_key"
  ON "ticket_satisfaction_surveys"("token_hash");
CREATE INDEX "ticket_satisfaction_surveys_org_created_idx"
  ON "ticket_satisfaction_surveys"("organization_id", "created_at");

ALTER TABLE "ticket_satisfaction_surveys"
  ADD CONSTRAINT "ticket_satisfaction_surveys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_satisfaction_surveys"
  ADD CONSTRAINT "ticket_satisfaction_surveys_ticket_org_fkey"
  FOREIGN KEY ("ticket_id", "organization_id")
  REFERENCES "tickets"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_satisfaction_surveys"
  ADD CONSTRAINT "ticket_satisfaction_surveys_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_satisfaction_surveys"
  ADD CONSTRAINT "ticket_satisfaction_surveys_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_satisfaction_surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_satisfaction_surveys" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ticket_satisfaction_surveys_tenant_isolation"
ON "ticket_satisfaction_surveys"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- Public (unauthenticated) lookup: a transaction that proves knowledge of
-- the token by setting `app.satisfaction_token_hash` to its SHA-256 may READ
-- exactly the row with that hash, and nothing else. Writes still require
-- the tenant context above. No SECURITY DEFINER and no BYPASSRLS involved.
CREATE POLICY "ticket_satisfaction_surveys_token_lookup"
ON "ticket_satisfaction_surveys"
FOR SELECT
USING (
  "token_hash" = nullif(current_setting('app.satisfaction_token_hash', true), '')
);

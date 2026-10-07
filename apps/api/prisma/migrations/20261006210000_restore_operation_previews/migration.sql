-- Persistent, one-use operation previews. These records bind destructive
-- confirmations to the organization, actor, browser session, target backup and
-- a fingerprint of the current tenant data.
CREATE TABLE "operation_previews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "target_backup_id" UUID,
    "target_checksum" VARCHAR(64),
    "current_fingerprint" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_previews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operation_previews_scope_expiry_idx"
  ON "operation_previews"("organization_id", "actor_user_id", "session_id", "expires_at");

CREATE INDEX "operation_previews_target_backup_idx"
  ON "operation_previews"("organization_id", "target_backup_id");

ALTER TABLE "operation_previews"
  ADD CONSTRAINT "operation_previews_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "operation_previews_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "operation_previews_session_id_fkey"
    FOREIGN KEY ("session_id")
    REFERENCES "refresh_sessions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "operation_previews_target_backup_id_organization_id_fkey"
    FOREIGN KEY ("target_backup_id", "organization_id")
    REFERENCES "backups"("id", "organization_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "operation_previews_kind_check"
    CHECK ("kind" IN ('RESTORE', 'DELETE')),
  ADD CONSTRAINT "operation_previews_fingerprint_check"
    CHECK ("current_fingerprint" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "operation_previews_checksum_check"
    CHECK ("target_checksum" IS NULL OR "target_checksum" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "operation_previews_target_check"
    CHECK (
      ("kind" = 'RESTORE' AND "target_backup_id" IS NOT NULL AND "target_checksum" IS NOT NULL)
      OR
      ("kind" = 'DELETE' AND "target_backup_id" IS NULL AND "target_checksum" IS NULL)
    ),
  ADD CONSTRAINT "operation_previews_payload_check"
    CHECK (jsonb_typeof("payload") = 'object'),
  ADD CONSTRAINT "operation_previews_expiry_check"
    CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "operation_previews_consumed_check"
    CHECK ("consumed_at" IS NULL OR "consumed_at" >= "created_at");

ALTER TABLE public.operation_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_previews FORCE ROW LEVEL SECURITY;

CREATE POLICY operation_previews_tenant_isolation
  ON public.operation_previews
  USING (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

-- This table is introduced after the generic maintenance-lock migration, so it
-- must opt in explicitly to the same write guard.
CREATE TRIGGER crm_tenant_maintenance_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.operation_previews
FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

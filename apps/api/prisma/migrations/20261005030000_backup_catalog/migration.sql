-- CreateTable
CREATE TABLE "backups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "reason" VARCHAR(24) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "schema_version" INTEGER,
    "checksum" VARCHAR(64),
    "byte_count" BIGINT,
    "counts" JSONB,
    "error_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_operations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "kind" VARCHAR(16) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "checkpoint" JSONB NOT NULL DEFAULT '{}',
    "stage" VARCHAR(80) NOT NULL DEFAULT 'QUEUED',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "worker_id" VARCHAR(160),
    "lease_until" TIMESTAMPTZ(6),
    "heartbeat_at" TIMESTAMPTZ(6),
    "error_code" VARCHAR(80),
    "preventive_backup_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_schedules" (
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" VARCHAR(16) NOT NULL DEFAULT 'DAILY',
    "local_time" VARCHAR(5) NOT NULL DEFAULT '02:00',
    "weekday" INTEGER NOT NULL DEFAULT 0,
    "interval_minutes" INTEGER,
    "retention_count" INTEGER NOT NULL DEFAULT 15,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    "next_run_at" TIMESTAMPTZ(6),
    "last_scheduled_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "backups_org_state_created_idx" ON "backups"("organization_id", "state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "backups_id_organization_key" ON "backups"("id", "organization_id");

-- CreateIndex
CREATE INDEX "data_operations_org_state_lease_idx" ON "data_operations"("organization_id", "state", "lease_until");

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_operations" ADD CONSTRAINT "data_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_operations" ADD CONSTRAINT "data_operations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_operations" ADD CONSTRAINT "data_operations_preventive_backup_id_organization_id_fkey" FOREIGN KEY ("preventive_backup_id", "organization_id") REFERENCES "backups"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Control records are never restored with business data.
ALTER TABLE public.backups
  ADD CONSTRAINT backups_reason_check CHECK (reason IN ('MANUAL','SCHEDULED','PRE_RESTORE','PRE_DELETE')),
  ADD CONSTRAINT backups_state_check CHECK (state IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  ADD CONSTRAINT backups_byte_count_check CHECK (byte_count IS NULL OR byte_count >= 0),
  ADD CONSTRAINT backups_completed_check CHECK (state <> 'COMPLETED' OR
    (schema_version IS NOT NULL AND schema_version > 0 AND checksum IS NOT NULL AND checksum ~ '^[a-f0-9]{64}$'
     AND byte_count IS NOT NULL AND byte_count > 0 AND counts IS NOT NULL AND jsonb_typeof(counts) = 'object' AND completed_at IS NOT NULL));
ALTER TABLE public.data_operations
  ADD CONSTRAINT data_operations_kind_check CHECK (kind IN ('BACKUP','RESTORE','DELETE')),
  ADD CONSTRAINT data_operations_state_check CHECK (state IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  ADD CONSTRAINT data_operations_progress_check CHECK (processed >= 0 AND attempts >= 0 AND (total IS NULL OR total >= processed));
ALTER TABLE public.backup_schedules
  ADD CONSTRAINT backup_schedules_frequency_check CHECK (frequency IN ('DAILY','WEEKLY','INTERVAL')),
  ADD CONSTRAINT backup_schedules_retention_check CHECK (retention_count IN (7,15,30,90)),
  ADD CONSTRAINT backup_schedules_timezone_check CHECK (timezone = 'America/Sao_Paulo'),
  ADD CONSTRAINT backup_schedules_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  ADD CONSTRAINT backup_schedules_time_check CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT backup_schedules_interval_check CHECK (frequency <> 'INTERVAL' OR (interval_minutes IS NOT NULL AND interval_minutes BETWEEN 1 AND 525600));

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups FORCE ROW LEVEL SECURITY;
CREATE POLICY backups_tenant_isolation ON public.backups USING
  (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
ALTER TABLE public.data_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY data_operations_tenant_isolation ON public.data_operations USING
  (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY backup_schedules_tenant_isolation ON public.backup_schedules USING
  (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);

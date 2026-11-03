-- Cycle 5: Knowledge Hub — notes, links, documents and passive AI metadata.

CREATE TYPE "knowledge_item_type" AS ENUM ('NOTE', 'LINK', 'DOCUMENT');
CREATE TYPE "knowledge_access_level" AS ENUM ('ORGANIZATION', 'PRIVATE');
CREATE TYPE "knowledge_ai_status" AS ENUM ('UNPROCESSED', 'READY', 'FAILED');

CREATE TABLE "knowledge_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "type" "knowledge_item_type" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "category" VARCHAR(120),
  "source" VARCHAR(200),
  "access_level" "knowledge_access_level" NOT NULL DEFAULT 'ORGANIZATION',
  "note_content" TEXT,
  "url" VARCHAR(2000),
  "original_file_name" VARCHAR(255),
  "mime_type" VARCHAR(255),
  "storage_key" VARCHAR(255),
  "size_bytes" BIGINT,
  "sha256" VARCHAR(64),
  "ai_status" "knowledge_ai_status" NOT NULL DEFAULT 'UNPROCESSED',
  "ai_processed_at" TIMESTAMPTZ(6),
  "ai_provider" VARCHAR(120),
  "ai_model" VARCHAR(160),
  "ai_external_ref" VARCHAR(255),
  "ai_metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_items_payload_check" CHECK (
    (
      "type" = 'NOTE'::"knowledge_item_type"
      AND "note_content" IS NOT NULL
      AND length(btrim("note_content")) > 0
      AND "url" IS NULL
      AND "original_file_name" IS NULL
      AND "mime_type" IS NULL
      AND "storage_key" IS NULL
      AND "size_bytes" IS NULL
      AND "sha256" IS NULL
    )
    OR
    (
      "type" = 'LINK'::"knowledge_item_type"
      AND "note_content" IS NULL
      AND "url" IS NOT NULL
      AND "url" ~* '^https?://'
      AND "original_file_name" IS NULL
      AND "mime_type" IS NULL
      AND "storage_key" IS NULL
      AND "size_bytes" IS NULL
      AND "sha256" IS NULL
    )
    OR
    (
      "type" = 'DOCUMENT'::"knowledge_item_type"
      AND "note_content" IS NULL
      AND "url" IS NULL
      AND "original_file_name" IS NOT NULL
      AND "mime_type" IS NOT NULL
      AND "storage_key" IS NOT NULL
      AND "size_bytes" IS NOT NULL
      AND "size_bytes" > 0
      AND "sha256" ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT "knowledge_items_ai_metadata_check" CHECK (
    ("ai_status" = 'UNPROCESSED'::"knowledge_ai_status" AND "ai_processed_at" IS NULL)
    OR "ai_status" <> 'UNPROCESSED'::"knowledge_ai_status"
  )
);

CREATE TABLE "knowledge_companies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "knowledge_item_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "knowledge_item_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_opportunities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "knowledge_item_id" UUID NOT NULL,
  "opportunity_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_items_id_organization_key"
  ON "knowledge_items"("id", "organization_id");
CREATE UNIQUE INDEX "knowledge_items_org_storage_key"
  ON "knowledge_items"("organization_id", "storage_key")
  WHERE "storage_key" IS NOT NULL;
CREATE INDEX "knowledge_items_org_deleted_created_idx"
  ON "knowledge_items"("organization_id", "deleted_at", "created_at");
CREATE INDEX "knowledge_items_org_type_deleted_created_idx"
  ON "knowledge_items"("organization_id", "type", "deleted_at", "created_at");
CREATE INDEX "knowledge_items_org_author_access_deleted_idx"
  ON "knowledge_items"("organization_id", "created_by", "access_level", "deleted_at");

CREATE UNIQUE INDEX "knowledge_companies_org_item_company_key"
  ON "knowledge_companies"("organization_id", "knowledge_item_id", "company_id");
CREATE INDEX "knowledge_companies_org_company_item_idx"
  ON "knowledge_companies"("organization_id", "company_id", "knowledge_item_id");

CREATE UNIQUE INDEX "knowledge_contacts_org_item_contact_key"
  ON "knowledge_contacts"("organization_id", "knowledge_item_id", "contact_id");
CREATE INDEX "knowledge_contacts_org_contact_item_idx"
  ON "knowledge_contacts"("organization_id", "contact_id", "knowledge_item_id");

CREATE UNIQUE INDEX "knowledge_opportunities_org_item_opportunity_key"
  ON "knowledge_opportunities"("organization_id", "knowledge_item_id", "opportunity_id");
CREATE INDEX "knowledge_opportunities_org_opportunity_item_idx"
  ON "knowledge_opportunities"("organization_id", "opportunity_id", "knowledge_item_id");

ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_companies"
  ADD CONSTRAINT "knowledge_companies_item_org_fkey"
  FOREIGN KEY ("knowledge_item_id", "organization_id")
  REFERENCES "knowledge_items"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_companies"
  ADD CONSTRAINT "knowledge_companies_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_contacts"
  ADD CONSTRAINT "knowledge_contacts_item_org_fkey"
  FOREIGN KEY ("knowledge_item_id", "organization_id")
  REFERENCES "knowledge_items"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_contacts"
  ADD CONSTRAINT "knowledge_contacts_contact_org_fkey"
  FOREIGN KEY ("contact_id", "organization_id")
  REFERENCES "contacts"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_opportunities"
  ADD CONSTRAINT "knowledge_opportunities_item_org_fkey"
  FOREIGN KEY ("knowledge_item_id", "organization_id")
  REFERENCES "knowledge_items"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_opportunities"
  ADD CONSTRAINT "knowledge_opportunities_opportunity_org_fkey"
  FOREIGN KEY ("opportunity_id", "organization_id")
  REFERENCES "opportunities"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_items_tenant_isolation"
  ON "knowledge_items"
  USING (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "knowledge_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_companies_tenant_isolation"
  ON "knowledge_companies"
  USING (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "knowledge_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_contacts_tenant_isolation"
  ON "knowledge_contacts"
  USING (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "knowledge_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_opportunities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_opportunities_tenant_isolation"
  ON "knowledge_opportunities"
  USING (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_items"
  FOR EACH ROW EXECUTE FUNCTION crm_tenant_maintenance_guard();
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_companies"
  FOR EACH ROW EXECUTE FUNCTION crm_tenant_maintenance_guard();
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_contacts"
  FOR EACH ROW EXECUTE FUNCTION crm_tenant_maintenance_guard();
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_opportunities"
  FOR EACH ROW EXECUTE FUNCTION crm_tenant_maintenance_guard();

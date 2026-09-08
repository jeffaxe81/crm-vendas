-- Cycle 2: CRM core - companies, contacts, relationships, tags and custom fields.

CREATE TYPE "contact_channel_type" AS ENUM ('EMAIL', 'PHONE', 'MOBILE', 'WHATSAPP', 'OTHER');
CREATE TYPE "relationship_entry_kind" AS ENUM ('NOTE', 'CALL_NOTE', 'EMAIL_NOTE', 'MEETING_NOTE', 'OTHER');
CREATE TYPE "custom_field_scope" AS ENUM ('COMPANY', 'CONTACT');
CREATE TYPE "custom_field_type" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT');

CREATE TABLE "companies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "legal_name" VARCHAR(200) NOT NULL,
  "trade_name" VARCHAR(200),
  "document" VARCHAR(32),
  "website" VARCHAR(500),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "full_name" VARCHAR(200) NOT NULL,
  "job_title" VARCHAR(160),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_channels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "type" "contact_channel_type" NOT NULL,
  "value" VARCHAR(320) NOT NULL,
  "label" VARCHAR(80),
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "relationship_label" VARCHAR(120),
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "relationship_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "company_id" UUID,
  "contact_id" UUID,
  "author_user_id" UUID NOT NULL,
  "kind" "relationship_entry_kind" NOT NULL,
  "content" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relationship_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relationship_entries_target_check" CHECK (
    "company_id" IS NOT NULL OR "contact_id" IS NOT NULL
  )
);

CREATE TABLE "tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "normalized_name" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_field_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "scope" "custom_field_scope" NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "type" "custom_field_type" NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_field_definitions_select_options_check" CHECK (
    "type" <> 'SELECT'::"custom_field_type"
    OR (jsonb_typeof("options") = 'array' AND jsonb_array_length("options") > 0)
  )
);

CREATE TABLE "company_custom_field_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "definition_id" UUID NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_custom_field_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "definition_id" UUID NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_org_document_key"
  ON "companies"("organization_id", "document")
  WHERE "document" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX "companies_org_deleted_legal_name_idx"
  ON "companies"("organization_id", "deleted_at", "legal_name");
CREATE INDEX "companies_org_trade_name_idx"
  ON "companies"("organization_id", "trade_name");

CREATE INDEX "contacts_org_deleted_full_name_idx"
  ON "contacts"("organization_id", "deleted_at", "full_name");

CREATE INDEX "contact_channels_org_contact_idx"
  ON "contact_channels"("organization_id", "contact_id");
CREATE INDEX "contact_channels_org_type_idx"
  ON "contact_channels"("organization_id", "type");
CREATE UNIQUE INDEX "contact_channels_contact_type_primary_key"
  ON "contact_channels"("organization_id", "contact_id", "type")
  WHERE "is_primary" = true;

CREATE UNIQUE INDEX "company_contacts_org_company_contact_key"
  ON "company_contacts"("organization_id", "company_id", "contact_id");
CREATE INDEX "company_contacts_org_contact_idx"
  ON "company_contacts"("organization_id", "contact_id");

CREATE INDEX "relationship_entries_org_occurred_idx"
  ON "relationship_entries"("organization_id", "occurred_at");
CREATE INDEX "relationship_entries_org_company_idx"
  ON "relationship_entries"("organization_id", "company_id", "occurred_at");
CREATE INDEX "relationship_entries_org_contact_idx"
  ON "relationship_entries"("organization_id", "contact_id", "occurred_at");

CREATE UNIQUE INDEX "tags_org_normalized_name_key"
  ON "tags"("organization_id", "normalized_name");
CREATE INDEX "tags_org_name_idx" ON "tags"("organization_id", "name");

CREATE UNIQUE INDEX "company_tags_org_company_tag_key"
  ON "company_tags"("organization_id", "company_id", "tag_id");
CREATE INDEX "company_tags_org_tag_idx"
  ON "company_tags"("organization_id", "tag_id");

CREATE UNIQUE INDEX "contact_tags_org_contact_tag_key"
  ON "contact_tags"("organization_id", "contact_id", "tag_id");
CREATE INDEX "contact_tags_org_tag_idx"
  ON "contact_tags"("organization_id", "tag_id");

CREATE UNIQUE INDEX "custom_field_definitions_org_scope_key_key"
  ON "custom_field_definitions"("organization_id", "scope", "key");
CREATE INDEX "custom_field_definitions_org_scope_active_idx"
  ON "custom_field_definitions"("organization_id", "scope", "is_active");

CREATE UNIQUE INDEX "company_custom_field_values_org_company_definition_key"
  ON "company_custom_field_values"("organization_id", "company_id", "definition_id");
CREATE INDEX "company_custom_field_values_org_definition_idx"
  ON "company_custom_field_values"("organization_id", "definition_id");

CREATE UNIQUE INDEX "contact_custom_field_values_org_contact_definition_key"
  ON "contact_custom_field_values"("organization_id", "contact_id", "definition_id");
CREATE INDEX "contact_custom_field_values_org_definition_idx"
  ON "contact_custom_field_values"("organization_id", "definition_id");

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_channels"
  ADD CONSTRAINT "contact_channels_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_channels"
  ADD CONSTRAINT "contact_channels_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_contacts"
  ADD CONSTRAINT "company_contacts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_contacts"
  ADD CONSTRAINT "company_contacts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_contacts"
  ADD CONSTRAINT "company_contacts_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relationship_entries"
  ADD CONSTRAINT "relationship_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relationship_entries"
  ADD CONSTRAINT "relationship_entries_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relationship_entries"
  ADD CONSTRAINT "relationship_entries_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relationship_entries"
  ADD CONSTRAINT "relationship_entries_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tags"
  ADD CONSTRAINT "tags_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_tags"
  ADD CONSTRAINT "company_tags_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_tags"
  ADD CONSTRAINT "company_tags_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_tags"
  ADD CONSTRAINT "company_tags_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_tags"
  ADD CONSTRAINT "contact_tags_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_tags"
  ADD CONSTRAINT "contact_tags_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_tags"
  ADD CONSTRAINT "contact_tags_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_field_definitions"
  ADD CONSTRAINT "custom_field_definitions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_custom_field_values"
  ADD CONSTRAINT "company_custom_field_values_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_custom_field_values"
  ADD CONSTRAINT "company_custom_field_values_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_custom_field_values"
  ADD CONSTRAINT "company_custom_field_values_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "custom_field_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_custom_field_values"
  ADD CONSTRAINT "contact_custom_field_values_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_custom_field_values"
  ADD CONSTRAINT "contact_custom_field_values_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_custom_field_values"
  ADD CONSTRAINT "contact_custom_field_values_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "custom_field_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

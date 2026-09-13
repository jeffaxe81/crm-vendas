-- Cycle 3: Enable Row-Level Security (RLS) for all tenant-scoped relationship tables
-- This migration completes RLS coverage across ALL tables with organizationId
-- Missing or invalid tenant context fails closed for the application role

-- 1. CompanyContact (link between Company and Contact)
ALTER TABLE "company_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_contacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "company_contacts_tenant_isolation"
ON "company_contacts"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 2. CompanyTag (link between Company and Tag)
ALTER TABLE "company_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY "company_tags_tenant_isolation"
ON "company_tags"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 3. ContactTag (link between Contact and Tag)
ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY "contact_tags_tenant_isolation"
ON "contact_tags"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 4. Tag (reference data)
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tags_tenant_isolation"
ON "tags"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 5. CustomFieldDefinition (metadata for custom fields)
ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_field_definitions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_definitions_tenant_isolation"
ON "custom_field_definitions"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 6. CompanyCustomFieldValue (values for company custom fields)
ALTER TABLE "company_custom_field_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_custom_field_values" FORCE ROW LEVEL SECURITY;

CREATE POLICY "company_custom_field_values_tenant_isolation"
ON "company_custom_field_values"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 7. ContactCustomFieldValue (values for contact custom fields)
ALTER TABLE "contact_custom_field_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_custom_field_values" FORCE ROW LEVEL SECURITY;

CREATE POLICY "contact_custom_field_values_tenant_isolation"
ON "contact_custom_field_values"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

-- 8. RelationshipEntry (activity log for relationships: calls, emails, notes, etc)
ALTER TABLE "relationship_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "relationship_entries_tenant_isolation"
ON "relationship_entries"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

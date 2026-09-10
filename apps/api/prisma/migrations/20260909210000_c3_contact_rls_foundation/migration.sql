-- Cycle 3.3: tenant RLS vertical for contacts.
-- Missing or invalid tenant context fails closed for the application role.

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "contacts_tenant_isolation"
ON "contacts"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

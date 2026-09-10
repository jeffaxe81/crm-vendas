-- Cycle 3.3: tenant RLS vertical for contact channels.
-- Missing or invalid tenant context fails closed for the application role.

ALTER TABLE "contact_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_channels" FORCE ROW LEVEL SECURITY;

CREATE POLICY "contact_channels_tenant_isolation"
ON "contact_channels"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

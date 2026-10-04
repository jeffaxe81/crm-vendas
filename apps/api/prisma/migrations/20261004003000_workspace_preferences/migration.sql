CREATE TABLE "user_workspace_preferences" (
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "preferences" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_workspace_preferences_pkey" PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "user_workspace_preferences_membership_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "organization_memberships"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "user_workspace_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_workspace_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_workspace_preferences_tenant_isolation" ON "user_workspace_preferences"
USING ("organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK ("organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);

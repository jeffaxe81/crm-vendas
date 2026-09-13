-- Cycle 3: Enable Row-Level Security (RLS) for audit_logs.
-- Every read/write of audit_logs is now routed through PrismaService.withTenant,
-- so the tenant context is always set before this table is touched.
-- Missing or invalid tenant context fails closed for the application role.
--
-- organization_memberships and refresh_sessions are deliberately NOT covered by
-- RLS: their core lookups (find memberships by userId during login, find a
-- session by tokenHash during refresh/logout) are how the tenant gets
-- discovered in the first place, and run before any organizationId is known.
-- Forcing RLS on those tables would break login and token refresh.

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_isolation"
ON "audit_logs"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

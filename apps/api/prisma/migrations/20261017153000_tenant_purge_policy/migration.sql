-- Opt-in retention policy for expired operation previews, isolated by tenant.
CREATE TABLE public.purge_policies (
  organization_id UUID NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  retention_days INTEGER NOT NULL DEFAULT 180,
  last_run_at TIMESTAMPTZ(6),
  updated_by UUID,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT purge_policies_retention_check CHECK (retention_days BETWEEN 30 AND 3650),
  CONSTRAINT purge_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT purge_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE public.purge_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY purge_policies_tenant_isolation ON public.purge_policies
 USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
 WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.purge_policies
 FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

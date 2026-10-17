-- Advisory per-tenant allocation for encrypted CRM backup objects.
-- This SQL-only operational table is intentionally excluded from CRM snapshots.
CREATE TABLE public.tenant_storage_allocations (
  organization_id UUID NOT NULL PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  allocation_gib INTEGER,
  updated_by UUID REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tenant_storage_allocation_gib_check
    CHECK (allocation_gib IS NULL OR allocation_gib BETWEEN 1 AND 10240)
);
ALTER TABLE public.tenant_storage_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_storage_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_storage_allocations_tenant_isolation
  ON public.tenant_storage_allocations
  USING (
    organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid
  );
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_storage_allocations
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

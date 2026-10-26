-- Existing allocations remain advisory until an administrator explicitly opts in.
ALTER TABLE public.tenant_storage_allocations ADD COLUMN enforced BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tenant_storage_allocations ADD CONSTRAINT enforced_requires_allocation CHECK (NOT enforced OR allocation_gib IS NOT NULL);
-- No backup FK: uncertain published objects must remain charged even after catalog removal.
CREATE TABLE public.backup_storage_reservations (
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 backup_id UUID NOT NULL,
 physical_bytes BIGINT NOT NULL CHECK (physical_bytes > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (organization_id, backup_id)
);
ALTER TABLE public.backup_storage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_storage_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY backup_storage_reservations_tenant_isolation ON public.backup_storage_reservations
 USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
 WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.backup_storage_reservations
 FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

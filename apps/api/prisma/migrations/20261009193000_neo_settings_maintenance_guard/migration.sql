-- The tenant-level maintenance lock must also cover the SQL-only NEO settings table.
-- The guard function was created by migration 20261006180500_restore_maintenance_lock.
DROP TRIGGER IF EXISTS crm_tenant_maintenance_guard
  ON public.neo_communication_settings;
CREATE TRIGGER crm_tenant_maintenance_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.neo_communication_settings
FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

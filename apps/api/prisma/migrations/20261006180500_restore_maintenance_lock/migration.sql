-- Block ordinary tenant writes while a destructive maintenance operation owns
-- the matching exclusive advisory lock. Prior writes hold a shared xact lock
-- until commit, so maintenance waits for them before taking its snapshot.
CREATE OR REPLACE FUNCTION public.crm_tenant_maintenance_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_org uuid;
  new_org uuid;
  maintenance_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    IF TG_OP <> 'INSERT' THEN old_org := OLD.id; END IF;
    IF TG_OP <> 'DELETE' THEN new_org := NEW.id; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_org := OLD.organization_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_org := NEW.organization_id; END IF;
  END IF;

  maintenance_org := nullif(
    current_setting('app.current_organization_id', true),
    ''
  )::uuid;

  IF current_setting('app.maintenance_authorized', true) = 'on' THEN
    IF maintenance_org IS NULL
       OR (old_org IS NOT NULL AND old_org <> maintenance_org)
       OR (new_org IS NOT NULL AND new_org <> maintenance_org) THEN
      RAISE EXCEPTION 'maintenance tenant scope mismatch'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Acquire in deterministic order if an update ever changes tenant identity.
  IF old_org IS NOT NULL AND new_org IS NOT NULL AND old_org <> new_org THEN
    IF old_org::text < new_org::text THEN
      PERFORM pg_advisory_xact_lock_shared(
        hashtextextended('tenant-maintenance:' || old_org::text, 0)
      );
      PERFORM pg_advisory_xact_lock_shared(
        hashtextextended('tenant-maintenance:' || new_org::text, 0)
      );
    ELSE
      PERFORM pg_advisory_xact_lock_shared(
        hashtextextended('tenant-maintenance:' || new_org::text, 0)
      );
      PERFORM pg_advisory_xact_lock_shared(
        hashtextextended('tenant-maintenance:' || old_org::text, 0)
      );
    END IF;
  ELSIF COALESCE(new_org, old_org) IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock_shared(
      hashtextextended(
        'tenant-maintenance:' || COALESCE(new_org, old_org)::text,
        0
      )
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

-- Organization-root changes must participate even though this table does not
-- carry organization_id.
DROP TRIGGER IF EXISTS crm_tenant_maintenance_guard ON public.organizations;
CREATE TRIGGER crm_tenant_maintenance_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

-- Install the guard on every current tenant table. A regression test verifies
-- coverage so any future table with organization_id must explicitly receive
-- the trigger in its migration.
DO $$
DECLARE
  tenant_table text;
BEGIN
  FOR tenant_table IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS crm_tenant_maintenance_guard ON public.%I',
      tenant_table
    );
    EXECUTE format(
      'CREATE TRIGGER crm_tenant_maintenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard()',
      tenant_table
    );
  END LOOP;
END
$$;

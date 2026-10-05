-- A privileged association must not be transferred to another user or tenant
-- by retaining is_superuser = true while changing its identity columns.
CREATE OR REPLACE FUNCTION protect_superuser_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  requires_provisioning boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    requires_provisioning := NEW.is_superuser;
  ELSIF TG_OP = 'UPDATE' THEN
    requires_provisioning := NEW.is_superuser IS DISTINCT FROM OLD.is_superuser
      OR ((OLD.is_superuser OR NEW.is_superuser) AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      ));
  END IF;
  IF requires_provisioning AND NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Superuser provisioning requires the deployment database role';
  END IF;
  RETURN NEW;
END;
$$;

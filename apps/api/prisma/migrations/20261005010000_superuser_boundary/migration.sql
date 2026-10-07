ALTER TABLE organization_memberships ADD COLUMN is_superuser boolean NOT NULL DEFAULT false;

-- Runtime SQL and ordinary user administration cannot delegate this attribute.
CREATE FUNCTION protect_superuser_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_superuser)
     OR (TG_OP = 'UPDATE' AND NEW.is_superuser IS DISTINCT FROM OLD.is_superuser) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolbypassrls) THEN
      RAISE EXCEPTION 'Superuser provisioning requires the deployment database role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_superuser_membership BEFORE INSERT OR UPDATE ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION protect_superuser_membership();

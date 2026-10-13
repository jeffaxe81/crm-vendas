-- F4.3-03B2: trusted inbound source inventory, OFFLINE ONLY.
-- No ingress controller, transport or dispatch. Registration is permanently
-- disabled until a separate audited migration and provider homologation.
-- Secret-bearing tables deliberately excluded from tenant data snapshots.
CREATE TABLE public.inbound_email_sources (
  route_key VARCHAR(80) NOT NULL PRIMARY KEY,
  organization_id UUID NOT NULL,
  source_key VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inbound_email_sources_org_route_unique UNIQUE (organization_id, route_key),
  CONSTRAINT inbound_email_sources_org_fk
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT inbound_email_sources_route_check
    CHECK (route_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CONSTRAINT inbound_email_sources_source_check
    CHECK (source_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CONSTRAINT inbound_email_sources_version_check CHECK (version > 0),
  CONSTRAINT inbound_email_sources_disabled_check CHECK (enabled = FALSE)
);

-- Globally unique route aliases never change owner or source, even when
-- a key is revoked. This prevents reassignment to a different tenant.
CREATE FUNCTION public.inbound_email_source_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INBOUND_EMAIL_SOURCE_IMMUTABLE';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.route_key IS DISTINCT FROM OLD.route_key
     OR NEW.source_key IS DISTINCT FROM OLD.source_key THEN
    RAISE EXCEPTION 'INBOUND_EMAIL_SOURCE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inbound_email_source_binding_immutable
  BEFORE UPDATE OR DELETE ON public.inbound_email_sources
  FOR EACH ROW EXECUTE FUNCTION public.inbound_email_source_immutable();

CREATE TABLE public.inbound_email_source_keys (
  organization_id UUID NOT NULL,
  route_key VARCHAR(80) NOT NULL,
  key_id VARCHAR(48) NOT NULL,
  encrypted_secret TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ(6),
  CONSTRAINT inbound_email_source_keys_pk PRIMARY KEY (route_key, key_id),
  CONSTRAINT inbound_email_source_keys_owner_fk
    FOREIGN KEY (organization_id, route_key)
    REFERENCES public.inbound_email_sources(organization_id, route_key)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT inbound_email_source_keys_key_check
    CHECK (key_id ~ '^[a-z0-9][a-z0-9._-]{1,47}$'),
  CONSTRAINT inbound_email_source_keys_cipher_check
    CHECK (length(encrypted_secret) BETWEEN 50 AND 512
       AND encrypted_secret LIKE 'v1.%'),
  CONSTRAINT inbound_email_source_keys_revocation_check
    CHECK ((revoked = FALSE AND revoked_at IS NULL)
        OR (revoked = TRUE AND revoked_at IS NOT NULL))
);

CREATE FUNCTION public.inbound_email_source_key_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INBOUND_EMAIL_SOURCE_KEY_IMMUTABLE';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.route_key IS DISTINCT FROM OLD.route_key
     OR NEW.key_id IS DISTINCT FROM OLD.key_id
     OR NEW.encrypted_secret IS DISTINCT FROM OLD.encrypted_secret
     OR (OLD.revoked AND NOT NEW.revoked) THEN
    RAISE EXCEPTION 'INBOUND_EMAIL_SOURCE_KEY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inbound_email_source_key_binding_immutable
  BEFORE UPDATE OR DELETE ON public.inbound_email_source_keys
  FOR EACH ROW EXECUTE FUNCTION public.inbound_email_source_key_immutable();

ALTER TABLE public.inbound_email_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY inbound_email_sources_tenant ON public.inbound_email_sources
  USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE public.inbound_email_source_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_source_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY inbound_email_source_keys_tenant ON public.inbound_email_source_keys
  USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);

CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.inbound_email_sources
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.inbound_email_source_keys
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

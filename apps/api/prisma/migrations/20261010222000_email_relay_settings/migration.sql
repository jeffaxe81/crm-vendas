-- F4.3-02D1 — per-tenant email relay configuration, never wired to sender.
CREATE TABLE public.email_relay_settings (
  organization_id UUID NOT NULL PRIMARY KEY,
  endpoint VARCHAR(512),
  encrypted_bearer_token TEXT,
  mode VARCHAR(24) NOT NULL DEFAULT 'DISABLED',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_relay_settings_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT email_relay_settings_mode_check
    CHECK (mode IN ('DISABLED', 'PREPARED')),
  CONSTRAINT email_relay_settings_version_check CHECK (version > 0),
  CONSTRAINT email_relay_settings_prepared_check
    CHECK (mode <> 'PREPARED' OR (endpoint IS NOT NULL AND encrypted_bearer_token IS NOT NULL))
);

ALTER TABLE public.email_relay_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_relay_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY email_relay_settings_tenant_isolation
  ON public.email_relay_settings
  USING (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );
CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.email_relay_settings
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

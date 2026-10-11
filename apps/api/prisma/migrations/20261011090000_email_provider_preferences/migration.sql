-- F4.3-04A: only tenant-owned choice of email provider; no credentials or sending.
CREATE TABLE public.email_provider_preferences (
  organization_id UUID NOT NULL PRIMARY KEY,
  provider_code VARCHAR(32) NOT NULL DEFAULT 'NONE',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_provider_preferences_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT email_provider_preferences_code_check CHECK (
    provider_code IN (
      'NONE', 'GMAIL', 'MICROSOFT_365', 'RESEND', 'AMAZON_SES',
      'SENDGRID', 'MAILGUN', 'SMTP', 'HTTPS_RELAY'
    )
  ),
  CONSTRAINT email_provider_preferences_version_check CHECK (version > 0)
);

ALTER TABLE public.email_provider_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_provider_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY email_provider_preferences_tenant_isolation
  ON public.email_provider_preferences
  USING (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.email_provider_preferences
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

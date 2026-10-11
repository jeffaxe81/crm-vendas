-- F4.3-05A: encrypted OAuth credential staging only, never outbound delivery.
-- Kept outside Prisma snapshot export and restore; re-authorization is required
-- after a restore. Provider tokens are never stored as plaintext.
CREATE TABLE public.email_oauth_credentials (
  organization_id UUID NOT NULL,
  provider_code VARCHAR(32) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  subject_hmac VARCHAR(64) NOT NULL,
  encrypted_sender TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_oauth_credentials_pkey PRIMARY KEY (organization_id, provider_code),
  CONSTRAINT email_oauth_credentials_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT email_oauth_credentials_provider_check
    CHECK (provider_code IN ('GMAIL', 'MICROSOFT_365')),
  CONSTRAINT email_oauth_credentials_version_check CHECK (version > 0),
  CONSTRAINT email_oauth_credentials_subject_check
    CHECK (subject_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT email_oauth_credentials_sender_cipher_check
    CHECK (length(encrypted_sender) BETWEEN 50 AND 2048
      AND encrypted_sender LIKE 'v1.%'),
  CONSTRAINT email_oauth_credentials_refresh_cipher_check
    CHECK (length(encrypted_refresh_token) BETWEEN 50 AND 20000
      AND encrypted_refresh_token LIKE 'v1.%')
);

ALTER TABLE public.email_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_oauth_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY email_oauth_credentials_tenant_isolation
  ON public.email_oauth_credentials
  USING (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.email_oauth_credentials
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

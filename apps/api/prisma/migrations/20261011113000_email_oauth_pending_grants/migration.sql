-- F4.3-04B2: server-side, single-use OAuth authorization state.
-- No OAuth callbacks, refresh tokens, provider credentials or outbound email.
CREATE TABLE public.email_oauth_pending_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  provider_code VARCHAR(32) NOT NULL,
  state_hash VARCHAR(64) NOT NULL UNIQUE,
  encrypted_code_verifier TEXT NOT NULL,
  redirect_uri VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT email_oauth_pending_membership_fkey
    FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT email_oauth_pending_provider_check CHECK (provider_code IN ('GMAIL', 'MICROSOFT_365')),
  CONSTRAINT email_oauth_pending_hash_check CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT email_oauth_pending_ciphertext_check CHECK (
    length(encrypted_code_verifier) BETWEEN 50 AND 512
    AND encrypted_code_verifier LIKE 'v1.%'
  ),
  CONSTRAINT email_oauth_pending_lifetime_check CHECK (
    expires_at > created_at AND expires_at <= created_at + INTERVAL '5 minutes'
  ),
  CONSTRAINT email_oauth_pending_redirect_check CHECK (
    redirect_uri LIKE 'https://%' AND redirect_uri NOT LIKE '%#%'
  )
);

CREATE INDEX email_oauth_pending_expiry_idx
  ON public.email_oauth_pending_grants (organization_id, expires_at);

ALTER TABLE public.email_oauth_pending_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_oauth_pending_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY email_oauth_pending_tenant_policy ON public.email_oauth_pending_grants
  USING (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid);

CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.email_oauth_pending_grants
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

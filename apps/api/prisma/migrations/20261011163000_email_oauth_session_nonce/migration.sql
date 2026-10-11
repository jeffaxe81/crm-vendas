-- F4.3-05B1: bind each OAuth authorization intent to its browser session
-- and encrypted OIDC nonce. Existing states are ephemeral; invalidate them.
TRUNCATE TABLE public.email_oauth_pending_grants;

ALTER TABLE public.email_oauth_pending_grants
  ADD COLUMN session_id UUID NOT NULL,
  ADD COLUMN encrypted_nonce TEXT NOT NULL,
  ADD CONSTRAINT email_oauth_pending_session_fkey
    FOREIGN KEY (session_id) REFERENCES public.refresh_sessions(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT email_oauth_pending_nonce_ciphertext_check
    CHECK (
      length(encrypted_nonce) BETWEEN 50 AND 512
      AND encrypted_nonce LIKE 'v1.%'
    );

CREATE INDEX email_oauth_pending_session_idx
  ON public.email_oauth_pending_grants (organization_id, session_id, expires_at);

-- Invalidate offline pending intents: they lack a credential revision binding.
DELETE FROM public.email_oauth_pending_grants;
ALTER TABLE public.email_oauth_pending_grants
  ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0
  CHECK (credential_version >= 0);

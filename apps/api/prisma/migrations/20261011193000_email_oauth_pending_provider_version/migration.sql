-- F4.3-05B6: authorization grants must be tied to the exact provider
-- preference revision, not only to the provider code. Any previous pending
-- state lacks that binding and must fail closed (NULL) until it expires.
ALTER TABLE public.email_oauth_pending_grants
  ADD COLUMN provider_preference_version INTEGER,
  ADD CONSTRAINT email_oauth_pending_provider_version_check
    CHECK (provider_preference_version IS NULL OR provider_preference_version >= 1);

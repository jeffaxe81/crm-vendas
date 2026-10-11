-- F4.3-05B7: bind encrypted credentials to the selected provider revision.
-- Existing credentials were staged without proof of this binding; their NULL
-- revision is intentionally NOT_CONNECTED until renewed under verified OAuth.
ALTER TABLE public.email_oauth_credentials
  ADD COLUMN provider_preference_version INTEGER,
  ADD CONSTRAINT email_oauth_credentials_preference_version_check
    CHECK (provider_preference_version IS NULL OR provider_preference_version >= 1);

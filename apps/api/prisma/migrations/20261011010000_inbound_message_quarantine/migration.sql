-- F4.3-03A: metadata-only inbound e-mail quarantine.
-- No raw external IDs, payloads, addresses, credentials or delivery actions.
CREATE TABLE public.inbound_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT 'EMAIL',
  source_key VARCHAR(80) NOT NULL,
  external_id_hash VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'QUARANTINED',
  received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inbound_messages_pkey PRIMARY KEY (id),
  CONSTRAINT inbound_messages_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT inbound_messages_channel_check CHECK (channel = 'EMAIL'),
  CONSTRAINT inbound_messages_status_check CHECK (status = 'QUARANTINED'),
  CONSTRAINT inbound_messages_source_key_check
    CHECK (source_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CONSTRAINT inbound_messages_external_hash_check
    CHECK (external_id_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX inbound_messages_org_source_external_key
  ON public.inbound_messages (organization_id, channel, source_key, external_id_hash);

CREATE INDEX inbound_messages_org_status_received_idx
  ON public.inbound_messages (organization_id, status, received_at);

ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY inbound_messages_tenant_isolation
  ON public.inbound_messages
  USING (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.current_organization_id', true), '')::uuid
  );

CREATE TRIGGER crm_tenant_maintenance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.inbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();

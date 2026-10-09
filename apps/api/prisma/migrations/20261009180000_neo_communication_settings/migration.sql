CREATE TABLE neo_communication_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  neo_url VARCHAR(2048),
  opening_mode VARCHAR(10) NOT NULL DEFAULT 'tab',
  frame_height INTEGER NOT NULL DEFAULT 800,
  frame_max_width INTEGER NOT NULL DEFAULT 1600,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT neo_communication_mode_check CHECK (opening_mode IN ('iframe', 'tab')),
  CONSTRAINT neo_communication_height_check CHECK (frame_height BETWEEN 320 AND 1600),
  CONSTRAINT neo_communication_width_check CHECK (frame_max_width BETWEEN 320 AND 1600)
);
ALTER TABLE neo_communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE neo_communication_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY neo_communication_tenant ON neo_communication_settings
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Release 1.2 quick setup progress belongs to each active organization membership.
-- Authorization is still derived from the authenticated session on every request.
ALTER TABLE "organization_memberships"
  ADD COLUMN "quick_setup_completed_steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "quick_setup_completed_at" TIMESTAMPTZ(6);

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_quick_setup_steps_array_check"
    CHECK (jsonb_typeof("quick_setup_completed_steps") = 'array');

-- Existing tenant RLS policies on organization_memberships cover the new columns.

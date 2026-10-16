-- Tenant identity uses the existing organizations RLS policies.
ALTER TABLE "organizations" ADD COLUMN "branding" JSONB;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_branding_object_check"
  CHECK (branding IS NULL OR jsonb_typeof(branding) = 'object');

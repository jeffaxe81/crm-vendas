-- CRM 1.1 onboarding is server-owned and scoped to each organization.
-- Existing organizations remain eligible for the oldest active administrator.
ALTER TABLE "organizations"
  ADD COLUMN "onboarding_owner_id" UUID,
  ADD COLUMN "onboarding_step" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(6);
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_onboarding_step_check" CHECK ("onboarding_step" BETWEEN 1 AND 4);
ALTER TABLE "organization_memberships"
  ADD COLUMN "tour_status" VARCHAR(16) NOT NULL DEFAULT 'PENDING';
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_tour_status_check"
    CHECK ("tour_status" IN ('PENDING', 'COMPLETED', 'SKIPPED'));
-- The existing organizations/memberships tenant RLS policies remain in force.

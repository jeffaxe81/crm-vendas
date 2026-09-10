ALTER TABLE "activities" ADD COLUMN "opportunity_id" UUID;

CREATE INDEX "activities_org_opportunity_idx"
  ON "activities"("organization_id", "opportunity_id");

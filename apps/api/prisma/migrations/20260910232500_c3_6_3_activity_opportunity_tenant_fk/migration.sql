CREATE UNIQUE INDEX "opportunities_id_organization_key"
  ON "opportunities"("id", "organization_id");

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_opportunity_id_organization_id_fkey"
  FOREIGN KEY ("opportunity_id", "organization_id")
  REFERENCES "opportunities"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

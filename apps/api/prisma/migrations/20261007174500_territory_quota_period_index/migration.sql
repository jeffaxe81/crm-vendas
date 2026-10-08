ALTER TABLE "territory_quotas"
  ADD COLUMN "period_index" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "territory_quotas_territory_period_year_key";

CREATE UNIQUE INDEX "territory_quotas_territory_period_year_index_key"
  ON "territory_quotas"("territory_id", "period", "year", "period_index");

ALTER TABLE "territory_quotas"
  ADD CONSTRAINT "territory_quotas_period_index_check"
  CHECK (
    ("period" = 'YEAR' AND "period_index" = 0)
    OR ("period" = 'MONTH' AND "period_index" BETWEEN 0 AND 12)
    OR ("period" = 'QUARTER' AND "period_index" BETWEEN 0 AND 4)
  );

COMMENT ON COLUMN "territory_quotas"."period_index" IS
  '0 = anual ou registro legado sem subdivisão; 1-12 = mês; 1-4 = trimestre';

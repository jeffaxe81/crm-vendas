-- C4.3 / C4.3.1: product catalog and opportunity line items.
-- Tenant isolation follows the existing pattern: FORCE RLS keyed on
-- app.current_organization_id and composite (id, organization_id) FKs.

CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "code" VARCHAR(60) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "unit_price" DECIMAL(19,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6),
  "deleted_by" UUID,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_unit_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "products_code_not_blank_check" CHECK (length(btrim("code")) > 0)
);

CREATE UNIQUE INDEX "products_id_organization_key"
  ON "products"("id", "organization_id");
CREATE INDEX "products_org_deleted_active_name_idx"
  ON "products"("organization_id", "deleted_at", "is_active", "name");
-- Code is unique per tenant, case-insensitive, among non-deleted products.
CREATE UNIQUE INDEX "products_org_code_active_key"
  ON "products"("organization_id", lower("code"))
  WHERE "deleted_at" IS NULL;

ALTER TABLE "products"
  ADD CONSTRAINT "products_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products"
  ADD CONSTRAINT "products_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products"
  ADD CONSTRAINT "products_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products"
  ADD CONSTRAINT "products_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;

CREATE POLICY "products_tenant_isolation"
ON "products"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

CREATE TABLE "opportunity_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "opportunity_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price" DECIMAL(19,2) NOT NULL,
  "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(19,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  CONSTRAINT "opportunity_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opportunity_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "opportunity_items_unit_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "opportunity_items_discount_check"
    CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100),
  CONSTRAINT "opportunity_items_line_total_check" CHECK ("line_total" >= 0)
);

CREATE INDEX "opportunity_items_org_opportunity_idx"
  ON "opportunity_items"("organization_id", "opportunity_id");
CREATE INDEX "opportunity_items_org_product_idx"
  ON "opportunity_items"("organization_id", "product_id");

ALTER TABLE "opportunity_items"
  ADD CONSTRAINT "opportunity_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_items"
  ADD CONSTRAINT "opportunity_items_opportunity_org_fkey"
  FOREIGN KEY ("opportunity_id", "organization_id")
  REFERENCES "opportunities"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_items"
  ADD CONSTRAINT "opportunity_items_product_org_fkey"
  FOREIGN KEY ("product_id", "organization_id")
  REFERENCES "products"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_items"
  ADD CONSTRAINT "opportunity_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_items"
  ADD CONSTRAINT "opportunity_items_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunity_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunity_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "opportunity_items_tenant_isolation"
ON "opportunity_items"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);

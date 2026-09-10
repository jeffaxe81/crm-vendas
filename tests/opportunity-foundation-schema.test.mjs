import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const schemaPath = new URL("../apps/api/prisma/schema.prisma", import.meta.url);
const migrationsPath = new URL(
  "../apps/api/prisma/migrations/",
  import.meta.url
);

async function readOpportunityMigration() {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const directory = entries.find(
    entry =>
      entry.isDirectory() && entry.name.includes("c3_opportunity_foundation")
  );

  assert.ok(
    directory,
    "expected C3.6.1 opportunity foundation migration directory"
  );

  return readFile(
    new URL(
      `../apps/api/prisma/migrations/${directory.name}/migration.sql`,
      import.meta.url
    ),
    "utf8"
  );
}

test("C3.6.1 defines the canonical Opportunity Prisma contract", async () => {
  const schema = await readFile(schemaPath, "utf8");

  for (const expected of [
    /model\s+Opportunity\s*\{/,
    /estimatedValue\s+Decimal\s+@map\("estimated_value"\)\s+@db\.Decimal\(19,\s*2\)/,
    /companyId\s+String\?\s+@map\("company_id"\)\s+@db\.Uuid/,
    /contactId\s+String\?\s+@map\("contact_id"\)\s+@db\.Uuid/,
    /ownerUserId\s+String\s+@map\("owner_user_id"\)\s+@db\.Uuid/,
    /pipelineId\s+String\s+@map\("pipeline_id"\)\s+@db\.Uuid/,
    /stageId\s+String\s+@map\("stage_id"\)\s+@db\.Uuid/,
    /@@index\(\[organizationId, deletedAt, stageId, expectedCloseAt\], map: "opportunities_org_deleted_stage_close_idx"\)/,
    /@@index\(\[organizationId, ownerUserId, deletedAt, expectedCloseAt\], map: "opportunities_org_owner_deleted_close_idx"\)/,
    /@@map\("opportunities"\)/,
  ]) {
    assert.match(schema, expected);
  }
});

test("C3.6.1 migration defines integrity and tenant isolation", async () => {
  const migration = await readOpportunityMigration();

  for (const expected of [
    'CREATE TABLE "opportunities"',
    'CONSTRAINT "opportunities_customer_xor_check"',
    'CONSTRAINT "opportunities_estimated_value_check"',
    'ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE "opportunities" FORCE ROW LEVEL SECURITY',
    'CREATE POLICY "opportunities_tenant_isolation"',
    "current_setting('app.current_organization_id', true)",
    'CREATE INDEX "opportunities_org_deleted_stage_close_idx"',
    'CREATE INDEX "opportunities_org_owner_deleted_close_idx"',
  ]) {
    assert.ok(
      migration.includes(expected),
      `missing migration contract: ${expected}`
    );
  }
});

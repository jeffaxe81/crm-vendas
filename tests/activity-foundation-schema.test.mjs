import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const schemaPath = new URL("../apps/api/prisma/schema.prisma", import.meta.url);
const migrationsPath = new URL("../apps/api/prisma/migrations/", import.meta.url);

async function readActivityMigration() {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const directory = entries.find(
    entry => entry.isDirectory() && entry.name.includes("c3_activity_foundation")
  );

  assert.ok(directory, "expected C3.5.1 activity foundation migration directory");

  return readFile(
    new URL(`../apps/api/prisma/migrations/${directory.name}/migration.sql`, import.meta.url),
    "utf8"
  );
}

test("C3.5.1 defines the canonical Activity Prisma contract", async () => {
  const schema = await readFile(schemaPath, "utf8");

  for (const expected of [
    "enum ActivityType",
    "enum ActivityStatus",
    "enum ActivityPriority",
    "model Activity",
    '@@index([organizationId, status, dueAt], map: "activities_org_status_due_idx")',
    '@@index([organizationId, ownerUserId, status, dueAt], map: "activities_org_owner_status_due_idx")',
    '@@map("activities")',
  ]) {
    assert.match(schema, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("C3.5.1 migration enforces tenant isolation with FORCE RLS", async () => {
  const migration = await readActivityMigration();

  for (const expected of [
    'ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE "activities" FORCE ROW LEVEL SECURITY',
    'CREATE POLICY "activities_tenant_isolation"',
    "current_setting('app.current_organization_id', true)",
    'CREATE INDEX "activities_org_status_due_idx"',
    'CREATE INDEX "activities_org_owner_status_due_idx"',
  ]) {
    assert.ok(migration.includes(expected), `missing migration contract: ${expected}`);
  }
});

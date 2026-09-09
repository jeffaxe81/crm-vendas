import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const schemaPath = new URL("../apps/api/prisma/schema.prisma", import.meta.url);
const migrationPath = new URL(
  "../apps/api/prisma/migrations/20260909002000_cycle3_sales_pipeline/migration.sql",
  import.meta.url
);

test("Cycle 3 Prisma schema defines tenant-scoped sales pipeline models", async () => {
  const schema = await readFile(schemaPath, "utf8");

  assert.match(
    schema,
    /enum OpportunityStatus\s*{[\s\S]*OPEN[\s\S]*WON[\s\S]*LOST/
  );
  assert.match(schema, /model Pipeline\s*{/);
  assert.match(schema, /model PipelineStage\s*{/);
  assert.match(schema, /model Opportunity\s*{/);
  assert.match(schema, /model OpportunityStageHistory\s*{/);

  assert.match(schema, /model Pipeline[\s\S]*organizationId\s+String/);
  assert.match(
    schema,
    /model PipelineStage[\s\S]*organizationId\s+String/
  );
  assert.match(schema, /model Opportunity[\s\S]*organizationId\s+String/);
  assert.match(
    schema,
    /model OpportunityStageHistory[\s\S]*organizationId\s+String/
  );

  assert.match(schema, /fromStageId\s+String\?/);
  assert.match(schema, /toStageId\s+String/);
  assert.match(schema, /actorUserId\s+String/);
  assert.match(schema, /occurredAt\s+DateTime/);
});

test("Cycle 3 migration creates sales pipeline tables without destructive rewrites", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /CREATE TYPE "opportunity_status"/);
  assert.match(migration, /CREATE TABLE "pipelines"/);
  assert.match(migration, /CREATE TABLE "pipeline_stages"/);
  assert.match(migration, /CREATE TABLE "opportunities"/);
  assert.match(migration, /CREATE TABLE "opportunity_stage_history"/);
  assert.match(migration, /FOREIGN KEY \("organization_id"\)/);
  assert.doesNotMatch(
    migration,
    /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i
  );
});

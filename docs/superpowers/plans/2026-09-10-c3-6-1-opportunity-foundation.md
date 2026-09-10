# C3.6.1 — Opportunity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the persistent, tenant-aware `Opportunity` foundation for the canonical CRM without adding REST endpoints, Web UI, Activity linkage, or automation.

**Architecture:** Extend the existing Prisma/PostgreSQL model with `Opportunity`, explicit Company-or-Contact ownership using XOR, Pipeline/Stage linkage, seller ownership, optimistic versioning, soft-delete fields, composite tenant-safe foreign keys, and fail-closed PostgreSQL RLS. Reuse the current Cycle 3 patterns used by `pipelines`, `pipeline_stages`, and `activities`; all public opportunity behavior remains deferred to C3.6.2+.

**Tech Stack:** Node.js 24.20.x, pnpm 11.3.0, TypeScript 5.9.3, Prisma 7.10.0, PostgreSQL, Jest 29.7.0, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-6-1-opportunity-foundation-design.md`

## Global Constraints

- Base branch is `main` at `ec28da9780cf51068c95c81e47a088586601e4b3`.
- Work branch is `feat/c3-6-1-opportunity-foundation`.
- Scope is only C3.6.1; do not create controllers, services, REST contracts, Web components, Kanban, Activity-to-Opportunity linkage, automation, forecast, products, proposals, commissions, or external integrations.
- `estimatedValue` is `Decimal @db.Decimal(19, 2)` and must be non-negative.
- Exactly one of `companyId` or `contactId` must be non-null.
- Opportunity commercial state is derived from `PipelineStage.kind`; do not add an Opportunity status enum.
- `organizationId` remains the tenant discriminator and is never supplied by a public client contract in this microdelivery.
- `opportunities` must use PostgreSQL `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, with fail-closed policy based on `current_setting('app.current_organization_id', true)`.
- `opportunity.read`, `opportunity.write`, and `opportunity.move` already exist; do not change RBAC in C3.6.1.
- Use `ON DELETE RESTRICT` for domain relationships.
- Active Company/Contact and active membership checks that cannot be represented as static SQL constraints remain application validations for C3.6.2; C3.6.1 must still guarantee tenant identity and referential coherence in the database.

---

### Task 1: Lock the Opportunity schema contract in a RED repository test

**Files:**

- Create: `tests/opportunity-foundation-schema.test.mjs`

**Interfaces:**

- Consumes: `apps/api/prisma/schema.prisma`, migration directory convention under `apps/api/prisma/migrations/`.
- Produces: an executable contract that defines the required Prisma model, scalar types, indexes, SQL constraints, and RLS markers for C3.6.1.

- [ ] **Step 1: Write the failing schema/migration contract test**

Create `tests/opportunity-foundation-schema.test.mjs` with the same Node test-runner pattern used by `tests/activity-foundation-schema.test.mjs`:

```js
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
    "model Opportunity",
    "estimatedValue   Decimal",
    "@db.Decimal(19, 2)",
    "companyId        String?",
    "contactId        String?",
    "ownerUserId      String",
    "pipelineId       String",
    "stageId          String",
    '@@index([organizationId, deletedAt, stageId, expectedCloseAt], map: "opportunities_org_deleted_stage_close_idx")',
    '@@index([organizationId, ownerUserId, deletedAt, expectedCloseAt], map: "opportunities_org_owner_deleted_close_idx")',
    '@@map("opportunities")',
  ]) {
    assert.ok(
      schema.includes(expected),
      `missing Prisma contract: ${expected}`
    );
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/opportunity-foundation-schema.test.mjs
```

Expected: FAIL because `model Opportunity` and the `c3_opportunity_foundation` migration do not exist yet.

- [ ] **Step 3: Commit the RED evidence**

```bash
git add tests/opportunity-foundation-schema.test.mjs
git commit -m "test: define C3.6.1 opportunity foundation contract"
```

---

### Task 2: Add the canonical Prisma Opportunity model and tenant-safe relation keys

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Test: `tests/opportunity-foundation-schema.test.mjs`

**Interfaces:**

- Consumes: existing `Organization`, `User`, `Company`, `Contact`, `Pipeline`, `PipelineStage`, and `OrganizationMembership` models.
- Produces: Prisma `Opportunity` model plus reverse relations and composite unique keys required by tenant-safe SQL FKs.

- [ ] **Step 1: Add reverse relations to existing models**

Add the following relation arrays, preserving existing field ordering/style:

```prisma
// Organization
opportunities Opportunity[]

// User
opportunitiesOwned   Opportunity[] @relation("OpportunityOwner")
opportunitiesCreated Opportunity[] @relation("OpportunityCreatedBy")
opportunitiesUpdated Opportunity[] @relation("OpportunityUpdatedBy")
opportunitiesDeleted Opportunity[] @relation("OpportunityDeletedBy")

// Company
opportunities Opportunity[]

// Contact
opportunities Opportunity[]

// Pipeline
opportunities Opportunity[]

// PipelineStage
opportunities Opportunity[]
```

Add composite uniqueness needed for tenant-aware references where it does not already exist:

```prisma
// Company
@@unique([id, organizationId], map: "companies_id_organization_key")

// Contact
@@unique([id, organizationId], map: "contacts_id_organization_key")

// PipelineStage
@@unique([id, organizationId, pipelineId], map: "pipeline_stages_id_org_pipeline_key")
```

Do not duplicate the existing Pipeline `(id, organizationId)` unique contract.

- [ ] **Step 2: Add the Opportunity model**

Add:

```prisma
model Opportunity {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  pipelineId      String   @map("pipeline_id") @db.Uuid
  stageId         String   @map("stage_id") @db.Uuid
  companyId       String?  @map("company_id") @db.Uuid
  contactId       String?  @map("contact_id") @db.Uuid
  ownerUserId     String   @map("owner_user_id") @db.Uuid
  title           String   @db.VarChar(200)
  estimatedValue  Decimal  @map("estimated_value") @db.Decimal(19, 2)
  expectedCloseAt DateTime? @map("expected_close_at") @db.Timestamptz(6)
  notes           String?
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy       String   @map("created_by") @db.Uuid
  updatedBy       String   @map("updated_by") @db.Uuid
  version         Int      @default(1)
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz(6)
  deletedBy       String?  @map("deleted_by") @db.Uuid

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  pipeline     Pipeline     @relation(fields: [pipelineId], references: [id], onDelete: Restrict)
  stage        PipelineStage @relation(fields: [stageId], references: [id], onDelete: Restrict)
  company      Company?     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  contact      Contact?     @relation(fields: [contactId], references: [id], onDelete: Restrict)
  owner        User         @relation("OpportunityOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  creator      User         @relation("OpportunityCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  updater      User         @relation("OpportunityUpdatedBy", fields: [updatedBy], references: [id], onDelete: Restrict)
  deleter      User?        @relation("OpportunityDeletedBy", fields: [deletedBy], references: [id], onDelete: Restrict)

  @@index([organizationId, deletedAt, stageId, expectedCloseAt], map: "opportunities_org_deleted_stage_close_idx")
  @@index([organizationId, ownerUserId, deletedAt, expectedCloseAt], map: "opportunities_org_owner_deleted_close_idx")
  @@index([organizationId, companyId, deletedAt], map: "opportunities_org_company_deleted_idx")
  @@index([organizationId, contactId, deletedAt], map: "opportunities_org_contact_deleted_idx")
  @@index([organizationId, pipelineId, stageId, deletedAt], map: "opportunities_org_pipeline_stage_deleted_idx")
  @@map("opportunities")
}
```

The SQL migration in Task 3 will add stricter composite foreign keys than Prisma's basic relation declarations where needed. Do not add a second source-of-truth status field.

- [ ] **Step 3: Validate and generate Prisma client**

Run:

```bash
pnpm --filter @axes/api exec prisma validate
pnpm --filter @axes/api prisma:generate
```

Expected: both commands exit 0.

- [ ] **Step 4: Run the repository contract test**

Run:

```bash
node --test tests/opportunity-foundation-schema.test.mjs
```

Expected: still FAIL only because the migration is not present; the Prisma-contract assertions must now pass.

- [ ] **Step 5: Commit the schema slice**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat: add canonical Opportunity Prisma model"
```

---

### Task 3: Add the PostgreSQL migration with XOR, money constraint, composite tenant FKs, and FORCE RLS

**Files:**

- Create: `apps/api/prisma/migrations/20260910133000_c3_opportunity_foundation/migration.sql`
- Modify if needed for schema parity: `apps/api/prisma/schema.prisma`
- Test: `tests/opportunity-foundation-schema.test.mjs`

**Interfaces:**

- Consumes: existing unique `(id, organization_id)` Pipeline key; existing unique `(organization_id, user_id)` OrganizationMembership key.
- Produces: `opportunities` table and database-level tenant/referential constraints.

- [ ] **Step 1: Create the migration**

The migration must create `opportunities` with the exact scalar layout from the spec and at least these checks:

```sql
CONSTRAINT "opportunities_customer_xor_check" CHECK (
  ("company_id" IS NOT NULL AND "contact_id" IS NULL)
  OR
  ("company_id" IS NULL AND "contact_id" IS NOT NULL)
),
CONSTRAINT "opportunities_estimated_value_check" CHECK ("estimated_value" >= 0)
```

Create tenant-safe parent keys only where absent:

```sql
CREATE UNIQUE INDEX "companies_id_organization_key"
  ON "companies"("id", "organization_id");
CREATE UNIQUE INDEX "contacts_id_organization_key"
  ON "contacts"("id", "organization_id");
CREATE UNIQUE INDEX "pipeline_stages_id_org_pipeline_key"
  ON "pipeline_stages"("id", "organization_id", "pipeline_id");
```

Add the following composite FKs:

```sql
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_contact_org_fkey"
  FOREIGN KEY ("contact_id", "organization_id")
  REFERENCES "contacts"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_pipeline_org_fkey"
  FOREIGN KEY ("pipeline_id", "organization_id")
  REFERENCES "pipelines"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_stage_org_pipeline_fkey"
  FOREIGN KEY ("stage_id", "organization_id", "pipeline_id")
  REFERENCES "pipeline_stages"("id", "organization_id", "pipeline_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_owner_membership_fkey"
  FOREIGN KEY ("organization_id", "owner_user_id")
  REFERENCES "organization_memberships"("organization_id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Keep normal User FKs for `owner_user_id`, `created_by`, `updated_by`, and optional `deleted_by` consistent with the project pattern. The membership FK guarantees the owner at least belongs to the Opportunity organization; `is_active=true` remains a C3.6.2 service validation.

- [ ] **Step 2: Add operational indexes**

Create exactly the indexes declared in the Prisma model:

```sql
CREATE INDEX "opportunities_org_deleted_stage_close_idx"
  ON "opportunities"("organization_id", "deleted_at", "stage_id", "expected_close_at");
CREATE INDEX "opportunities_org_owner_deleted_close_idx"
  ON "opportunities"("organization_id", "owner_user_id", "deleted_at", "expected_close_at");
CREATE INDEX "opportunities_org_company_deleted_idx"
  ON "opportunities"("organization_id", "company_id", "deleted_at");
CREATE INDEX "opportunities_org_contact_deleted_idx"
  ON "opportunities"("organization_id", "contact_id", "deleted_at");
CREATE INDEX "opportunities_org_pipeline_stage_deleted_idx"
  ON "opportunities"("organization_id", "pipeline_id", "stage_id", "deleted_at");
```

- [ ] **Step 3: Add fail-closed RLS**

Append:

```sql
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" FORCE ROW LEVEL SECURITY;

CREATE POLICY "opportunities_tenant_isolation"
ON "opportunities"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);
```

- [ ] **Step 4: Run the static contract test and Prisma validation**

Run:

```bash
node --test tests/opportunity-foundation-schema.test.mjs
pnpm --filter @axes/api exec prisma validate
pnpm --filter @axes/api prisma:generate
```

Expected: all exit 0.

- [ ] **Step 5: Commit the database foundation**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260910133000_c3_opportunity_foundation/migration.sql
git commit -m "feat: add C3.6.1 opportunity database foundation"
```

---

### Task 4: Prove RLS and cross-tenant referential integrity with integration tests

**Files:**

- Create: `apps/api/src/database/opportunity-rls.integration.spec.ts`

**Interfaces:**

- Consumes: generated `PrismaClient`, `PrismaService.withTenant`, `Opportunity` model and C3.6.1 migration.
- Produces: adversarial evidence that fail-closed RLS, tenant isolation, XOR, non-negative value, Pipeline/Stage coherence, and owner membership constraints are effective.

- [ ] **Step 1: Write integration fixtures**

Follow `activity-rls.integration.spec.ts` setup exactly: an application-role `PrismaService` plus a migration/admin `PrismaClient`. Create two organizations A/B, users A/B, active memberships, companies/contacts, pipelines, and stages.

Use deterministic UUIDs in the `91000000-...` through `97000000-...` ranges so tests are isolated from existing RLS fixtures.

- [ ] **Step 2: Add the fail-closed/isolation test**

The core assertion must be equivalent to:

```ts
await expect(prisma.opportunity.findMany()).resolves.toEqual([]);

const tenantA = await prisma.withTenant(organizationA, tenant =>
  tenant.opportunity.findMany({ orderBy: { title: "asc" } })
);
expect(tenantA.map(item => item.id)).toEqual([opportunityA]);

const tenantB = await prisma.withTenant(organizationB, tenant =>
  tenant.opportunity.findMany({ orderBy: { title: "asc" } })
);
expect(tenantB.map(item => item.id)).toEqual([opportunityB]);
```

- [ ] **Step 3: Add adversarial writes**

Test each invariant independently and require rejection:

```ts
await expect(
  /* tenant A opportunity with organizationId B */
).rejects.toThrow();
await expect(
  /* opportunity with both companyId and contactId */
).rejects.toThrow();
await expect(
  /* opportunity with neither companyId nor contactId */
).rejects.toThrow();
await expect(/* estimatedValue = -0.01 */).rejects.toThrow();
await expect(/* company from B with organization A */).rejects.toThrow();
await expect(/* contact from B with organization A */).rejects.toThrow();
await expect(
  /* stage from a different pipeline than pipelineId */
).rejects.toThrow();
await expect(
  /* ownerUserId without membership in opportunity organization */
).rejects.toThrow();
```

For positive control, insert one Company-backed and one Contact-backed Opportunity with matching tenant/pipeline/stage/owner membership and assert they succeed.

- [ ] **Step 4: Run targeted integration tests**

Prerequisite: PostgreSQL test database with migrations deployed and application role configured, as in CI.

Run:

```bash
pnpm --filter @axes/api test -- opportunity-rls.integration.spec.ts
```

Expected: PASS, 0 failed tests.

- [ ] **Step 5: Commit the adversarial coverage**

```bash
git add apps/api/src/database/opportunity-rls.integration.spec.ts
git commit -m "test: verify opportunity tenant and integrity boundaries"
```

---

### Task 5: Run the complete C3.6.1 gate and record the checkpoint

**Files:**

- Create: `docs/checkpoints/c3-6-1-opportunity-foundation.md`
- Modify: `CHANGELOG.md`
- Do not modify API/Web source files.

**Interfaces:**

- Consumes: all C3.6.1 commits and CI commands.
- Produces: audit-ready checkpoint documenting the exact head SHA and evidence before human merge approval.

- [ ] **Step 1: Run the full repository verification**

Run:

```bash
pnpm verify
```

Expected: exit 0; foundation verification, Prettier, lint, typecheck, repository tests, package tests, and builds all pass.

- [ ] **Step 2: Run database/E2E/container gates required by the repository workflow**

Execute the same commands represented by the GitHub Actions quality gate: deploy migrations to a fresh PostgreSQL database, configure the application DB role, run the integration suite, existing E2E suite, Compose contract, and application image builds. Do not claim GREEN from partial commands; the final GitHub Actions run on the branch head is authoritative.

- [ ] **Step 3: Record the checkpoint**

Create `docs/checkpoints/c3-6-1-opportunity-foundation.md` containing:

```md
# C3.6.1 — Opportunity Foundation Checkpoint

## Resultado

Fundação tenant-aware de Oportunidades implementada sem API ou Web.

## Contrato entregue

- Opportunity com Company XOR Contact;
- Decimal(19,2) não negativo;
- Pipeline + Stage coerentes;
- owner pertencente à organização;
- soft-delete/versionamento preparados;
- RLS ENABLE + FORCE fail-closed;
- índices tenant-aware;
- testes adversariais cross-tenant.

## Fora do escopo preservado

API, Web, Kanban, Activity -> Opportunity, automação e Fases 2 a 6 permanecem fora da C3.6.1.

## Gate humano

Este checkpoint não autoriza merge. O merge depende de CI final GREEN no mesmo head SHA e aprovação explícita do responsável.
```

Replace/add the exact branch head SHA and CI run identifier only after they exist; never pre-fill guessed values.

- [ ] **Step 4: Update CHANGELOG**

Add an Unreleased C3.6.1 entry describing only the model/migration/RLS/integrity/test foundation. Explicitly state that no endpoint, Web UI, Activity linkage, or RBAC change is included.

- [ ] **Step 5: Format docs and rerun verification**

Run:

```bash
pnpm exec prettier --check CHANGELOG.md docs/checkpoints/c3-6-1-opportunity-foundation.md
pnpm verify
```

Expected: both exit 0.

- [ ] **Step 6: Commit documentation**

```bash
git add CHANGELOG.md docs/checkpoints/c3-6-1-opportunity-foundation.md
git commit -m "docs: checkpoint C3.6.1 opportunity foundation"
```

- [ ] **Step 7: Open/update the PR and require the final CI gate**

PR title:

```text
C3.6.1 — Opportunity tenant-aware foundation
```

PR body must state the exact scope and exclusions, and that merge remains blocked until the latest branch head has a completed successful quality-gate run plus explicit human approval.

Do not merge as part of this plan.

---

## Self-review checklist

- Spec coverage: model, XOR client target, Decimal(19,2), non-negative check, Pipeline/Stage coherence, owner membership, soft delete, versioning, RLS, indexes, RBAC non-change, Activity non-change, and exclusions are each mapped to a task.
- Placeholder scan: implementation instructions contain no TBD/TODO/fill-later steps. The checkpoint explicitly delays only runtime-derived SHA/run values, which cannot be known before execution and must never be guessed.
- Type consistency: `organizationId`, `pipelineId`, `stageId`, `companyId`, `contactId`, `ownerUserId`, `estimatedValue`, and `expectedCloseAt` use the same names throughout schema, migration, tests, and checkpoint.
- Scope boundary: no C3.6.2 API code, no C3.6.3 Activity linkage, no C3.6.4 Web/Kanban code, and no Fase 2+ work appears in this plan.

# C3.3 RLS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL Row-Level Security as fail-closed defense in depth for Axesistemas tenant-owned CRM tables without changing authenticated organization semantics or Cycle 0–2 public API contracts.

**Architecture:** Keep authenticated `organizationId` scoping in NestJS as the first authorization boundary. Add a transaction-scoped PostgreSQL setting (`app.current_organization_id`) and RLS policies that compare each tenant-owned row's `organization_id` with that setting. Application tenant work executes inside a Prisma interactive transaction that sets the tenant context with `set_config(..., true)` before tenant-owned queries.

**Tech Stack:** Node.js 24.20.0, pnpm 11.3.0, NestJS, Prisma, `@prisma/adapter-pg`, PostgreSQL 18, Vitest/Jest-compatible repository test conventions.

**Spec:** `docs/superpowers/specs/2026-09-09-bottlecrm-engine-adoption-design.md`

## Global Constraints

- Preserve Cycle 0–2 API/authentication behavior.
- Tenant authority comes from authenticated server-side context, never request payload.
- RLS is defense in depth; existing application-level `organizationId` predicates remain.
- Missing database tenant context must expose zero tenant-owned rows and reject tenant-owned writes.
- Application database role must not be a PostgreSQL superuser and must not have `BYPASSRLS`.
- Use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on protected tables.
- Context is transaction-local to prevent pooled-connection tenant leakage.
- No destructive schema/data migration.
- RED must be observed before production implementation for each behavior change.
- No merge to `main` without full green verification and explicit approval.

---

### Task 1: Characterize database role and missing-context behavior

**Files:**

- Create: `apps/api/src/database/tenant-rls.integration.spec.ts`

**Interfaces:**

- Consumes: existing `PrismaService` and PostgreSQL test database.
- Produces: executable security expectations for role safety and fail-closed RLS.

- [ ] **Step 1: Write a failing integration test for application-role safety**

Add a test that queries `pg_roles` for `current_user` and asserts `rolsuper = false` and `rolbypassrls = false`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @crm/api test -- tenant-rls.integration.spec.ts`

Expected: FAIL if the current test/application database role is privileged or because the RLS test fixture/helper is not yet available. Record the exact failure.

- [ ] **Step 3: Write a failing missing-context read test**

Create two organizations and tenant-owned Company rows through an administrative fixture path, then query `companies` without `app.current_organization_id`. Assert zero rows are visible through the application role.

- [ ] **Step 4: Run and verify RED**

Expected: FAIL because current schema has no RLS and rows remain visible.

- [ ] **Step 5: Commit RED tests only**

Commit: `test(c3.3): characterize tenant RLS fail-closed boundary`

### Task 2: Add RLS migration

**Files:**

- Create: `apps/api/prisma/migrations/20260909XXXXXX_cycle3_rls_foundation/migration.sql`
- Test: `apps/api/src/database/tenant-rls.integration.spec.ts`

**Interfaces:**

- Consumes PostgreSQL setting `app.current_organization_id`.
- Produces policy expression equivalent to `organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid` for tenant-owned tables.

Protect these existing tenant-owned tables in the first microdelivery: `refresh_sessions`, `audit_logs`, `companies`, `contacts`, `contact_channels`, `company_contacts`, `relationship_entries`, `tags`, `company_tags`, `contact_tags`, `custom_field_definitions`, `company_custom_field_values`, `contact_custom_field_values`.

`organizations`, `users` and `organization_memberships` are intentionally excluded from C3.3 because login/membership resolution needs an explicit bootstrap security design before RLS can be applied safely.

- [ ] **Step 1: Create the migration with ENABLE + FORCE RLS**

For every protected table execute `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;` and `ALTER TABLE <table> FORCE ROW LEVEL SECURITY;`.

- [ ] **Step 2: Add one policy per protected table**

Use both `USING` and `WITH CHECK` with the same fail-closed tenant expression. Do not use a fallback organization and do not permit NULL context.

- [ ] **Step 3: Apply migration to the isolated test database**

Run: `pnpm --filter @crm/api prisma:migrate:deploy` using the repository's isolated PostgreSQL test configuration.

Expected: migration succeeds with no destructive-table warning.

- [ ] **Step 4: Re-run missing-context tests**

Expected: GREEN for zero-row read and rejected cross/no-context writes; role-safety assertion must also be GREEN.

- [ ] **Step 5: Commit**

Commit: `feat(c3.3): add fail-closed PostgreSQL RLS policies`

### Task 3: Add transaction-scoped tenant database context

**Files:**

- Modify: `apps/api/src/database/prisma.service.ts`
- Create: `apps/api/src/database/tenant-database-context.ts`
- Create: `apps/api/src/database/tenant-database-context.spec.ts`
- Modify: `apps/api/src/database/database.module.ts`

**Interfaces:**

- Produces: `TenantDatabaseContext.run<T>(organizationId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`.
- Guarantee: calls `SELECT set_config('app.current_organization_id', <uuid>, true)` inside the same interactive transaction before `work(tx)`.
- Guarantee: rejects malformed/non-UUID organization identifiers before issuing business queries.

- [ ] **Step 1: Write failing unit test for context ordering**

Test that `set_config` is invoked before the work callback and that the callback receives the transaction client.

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm --filter @crm/api test -- tenant-database-context.spec.ts`

Expected: FAIL because `TenantDatabaseContext` does not exist.

- [ ] **Step 3: Implement minimal `TenantDatabaseContext`**

Use `PrismaService.$transaction(async tx => { await tx.$executeRaw\`SELECT set_config('app.current_organization_id', ${organizationId}, true)\`; return work(tx); })`. Validate UUID input before transaction execution.

- [ ] **Step 4: Verify GREEN**

Run focused unit test. Expected: PASS.

- [ ] **Step 5: Add integration tests for transaction-local isolation**

Prove org A sees only A rows, org B sees only B rows, and a fresh/no-context query after both transactions sees zero rows. This is the connection-pool leakage regression test.

- [ ] **Step 6: Run focused integration tests**

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat(c3.3): add transaction-scoped tenant database context`

### Task 4: Route one vertical slice through tenant context

**Files:**

- Modify: `apps/api/src/companies/companies.service.ts` (or the exact existing Company application service discovered before edit)
- Modify: corresponding Company service/integration specs.

**Interfaces:**

- Consumes: `TenantDatabaseContext.run()`.
- Preserves: current Company DTOs, authorization, `organizationId` predicates, optimistic/version semantics and audit behavior.

- [ ] **Step 1: Locate the authoritative Company service and its current tests**

Use repository paths, not a parallel service. If the actual path differs from the planned path, record the path in the commit message/review package; do not restructure unrelated modules.

- [ ] **Step 2: Add failing Company integration test under RLS**

Authenticate/use organization A context, create/read/update a Company, and assert the public behavior remains unchanged while database context is required.

- [ ] **Step 3: Verify RED**

Expected: FAIL after RLS because the current service does not set database tenant context.

- [ ] **Step 4: Adapt Company persistence calls to the transaction client**

Pass the transaction client through the minimum persistence boundary. Keep explicit `organizationId` filters even though RLS also enforces them.

- [ ] **Step 5: Verify Company GREEN and cross-tenant denial**

Run Company focused tests plus `tenant-rls.integration.spec.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `refactor(c3.3): enforce tenant DB context for companies`

### Task 5: Extend tenant context to remaining protected Cycle 2 modules

**Files:**

- Modify only existing persistence services for contacts, contact channels/links, relationship history, tags, custom fields and audit/refresh-session flows that access protected tables.
- Modify their existing focused tests.

**Interfaces:**

- Consumes: `TenantDatabaseContext.run()` and transaction client.
- Preserves all current public contracts and application-level tenant predicates.

- [ ] **Step 1: Migrate one module at a time, starting with Contacts**

Before each module edit, add/enable a focused failing integration test under RLS and observe RED.

- [ ] **Step 2: Make the minimum transaction-client adaptation**

Do not batch unrelated refactors. Preserve existing service signatures unless a transaction client must be threaded through a private persistence helper.

- [ ] **Step 3: Run the module's focused tests to GREEN**

Do this independently for Contacts, channels/links, history, tags, custom fields, audit and refresh sessions.

- [ ] **Step 4: Run the tenant isolation suite after each module**

Expected: same-tenant behavior passes; cross-tenant/no-context access fails closed.

- [ ] **Step 5: Commit each independently reviewable module adaptation**

Use `refactor(c3.3): enforce tenant DB context for <module>`.

### Task 6: Operational guard and full verification

**Files:**

- Modify: `README.md`
- Create: `docs/operations/postgresql-rls.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Documents required application DB role: `NOSUPERUSER NOBYPASSRLS`.
- Documents tenant context: transaction-local `app.current_organization_id`.
- Documents rollback: disable/drop policies independently before reverting application context wiring.

- [ ] **Step 1: Add deployment documentation**

Document role requirements, RLS verification SQL, migration order, failure symptoms, connection-pool safety and rollback order.

- [ ] **Step 2: Run formatting/lint/type checks**

Run repository-standard `pnpm verify`.

Expected: PASS with no new warnings/errors.

- [ ] **Step 3: Run database migrations from a clean database**

Run the repository's documented Prisma generate + migration deploy flow against a clean PostgreSQL instance.

Expected: all Cycle 1, Cycle 2 and C3.3 migrations apply successfully.

- [ ] **Step 4: Run complete API and E2E regression gates**

Use the same commands documented by the repository CI/README, including cross-tenant tests.

Expected: PASS on the same candidate commit.

- [ ] **Step 5: Inspect final diff for scope**

Confirm no Django/Svelte/Celery/Redis runtime was introduced, no Cycle 0–2 table was dropped, and explicit application `organizationId` scoping remains.

- [ ] **Step 6: Record candidate SHA and gate evidence**

Update changelog/PR body with exact commands and results. Stop before merge for explicit approval.

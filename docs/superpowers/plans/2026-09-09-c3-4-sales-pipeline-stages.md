# C3.4 Sales Pipeline Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tenant-aware sales pipelines and ordered stages as the foundation for CRM opportunities.

**Architecture:** Extend the existing NestJS + Prisma modular monolith with `Pipeline` and `PipelineStage` entities, PostgreSQL FORCE RLS using `app.current_organization_id`, and a small API module that lists pipelines and idempotently creates the RN-07 default pipeline. All runtime persistence flows execute through `PrismaService.withTenant(...)` and creation is audited.

**Tech Stack:** Node 24.20.0, pnpm 11.3.0, NestJS, Prisma 7.10.0, PostgreSQL 18, Jest, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-c3-4-sales-pipeline-stages-design.md`

## Global Constraints

- Preserve the existing Next.js + NestJS + Prisma + PostgreSQL architecture.
- Preserve C3.3 fail-closed tenant isolation.
- Never grant `BYPASSRLS` and never relax `FORCE ROW LEVEL SECURITY`.
- Every organization-scoped persistence operation must run under explicit tenant context.
- Default stages are: Prospecção, Qualificação, Proposta, Negociação, Ganha, Perdida.
- Do not implement arbitrary custom pipeline editing or full Opportunity CRUD in C3.4.

---

### Task 1: Characterize pipeline tenant isolation

**Files:**

- Create: `apps/api/src/pipelines/pipelines.integration.spec.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_c3_pipeline_stage_foundation/migration.sql`

**Interfaces:**

- Produces Prisma models `Pipeline`, `PipelineStage` and enum `PipelineStageKind`.

- [ ] Write RED integration expectations for two organizations, missing tenant context, cross-tenant reads and six-stage bootstrap shape.
- [ ] Add minimal Prisma models and migration.
- [ ] Enable and FORCE RLS on both tables with tenant policies based on `current_setting('app.current_organization_id', true)`.
- [ ] Add database constraints for organization/pipeline consistency and unique stage position.
- [ ] Run targeted integration tests and verify GREEN.
- [ ] Commit.

### Task 2: Add pipeline contracts and service

**Files:**

- Create: `apps/api/src/pipelines/pipelines.service.ts`
- Create: `apps/api/src/pipelines/pipelines.controller.ts`
- Create: `apps/api/src/pipelines/pipelines.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Produces `list(organizationId)` and `ensureDefault(context)` service operations.
- Produces `GET /api/v1/pipelines` and `POST /api/v1/pipelines/default`.

- [ ] Extend RED tests through HTTP endpoints.
- [ ] Implement list under `withTenant` with stages ordered by position.
- [ ] Implement idempotent default bootstrap in one tenant transaction.
- [ ] Integrate current authentication/authorization context and audit service.
- [ ] Run pipeline test suite and verify GREEN.
- [ ] Commit.

### Task 3: Security regression and documentation

**Files:**

- Modify: `apps/api/src/database/tenant-rls.integration.spec.ts`
- Modify: `docs/modelo-de-dados-e-api.md`
- Modify: `docs/regras-de-negocio-e-aceite.md` only if needed to reflect implemented contract without changing RN-07 meaning.
- Modify: `CHANGELOG.md`

- [ ] Add direct RLS regression coverage for pipelines and stages.
- [ ] Document the implemented API and data model.
- [ ] Confirm no custom-stage functionality leaked into C3.4.
- [ ] Run formatting, lint, typecheck and targeted tests.
- [ ] Commit.

### Task 4: Full quality gate and integration

- [ ] Run repository verification equivalent to CI.
- [ ] Open a PR from `feat/c3-4-sales-pipeline-stages` to `main`.
- [ ] Verify GitHub Actions source/tests, administrator bootstrap, Chromium, E2E, Compose contract and image builds are all GREEN.
- [ ] Review changed files for scope creep and tenant-isolation regressions.
- [ ] Merge only the verified head to `main` as the user has explicitly authorized completion of C3.4 through main.
- [ ] Confirm the resulting `main` SHA and record completion.

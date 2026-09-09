# Cycle 3 BottleCRM Engine Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate BottleCRM as the upstream CRM engine, select the components that strengthen Axesistemas CRM, and migrate incrementally without regressing the homologated Cycle 0–2 behavior.

**Architecture:** BottleCRM is treated as upstream/reference input, not as the Axesistemas product. The target is `BottleCRM upstream -> Axesistemas Engine -> Axesistemas CRM -> vertical modules/integrations`, with Axesistemas contracts and product decisions remaining authoritative. Framework and persistence changes are gated by C3.0–C3.2 evidence before production behavior is modified.

**Tech Stack:** Current baseline: Node.js 24.20.0, pnpm 11.3.0, Next.js, NestJS, Prisma, PostgreSQL. BottleCRM technologies are evaluation inputs and are not dependencies until C3.2 explicitly approves them.

**Spec:** `docs/superpowers/specs/2026-09-09-cycle-3-bottlecrm-engine-adoption-design.md`

## Global Constraints

- Preserve all homologated Cycle 0–2 behavior until an explicit replacement and migration gate passes.
- Never implement directly on `main`.
- Use ADOPT, ADAPT, KEEP_AXES, REPLACE or IGNORE for every evaluated BottleCRM capability.
- Multi-company isolation is mandatory; evaluate PostgreSQL RLS as defense-in-depth.
- TDD is mandatory for behavior-changing microdeliveries.
- API and event contracts remain Axesistemas product contracts.
- No framework migration is implicit.
- No merge occurs without same-checkpoint green verification and explicit approval.

---

### Task 1: C3.0 — Adoption baseline

**Files:**
- Create: `docs/superpowers/specs/2026-09-09-cycle-3-bottlecrm-engine-adoption-design.md`
- Create: `docs/architecture/2026-09-09-bottlecrm-adoption-matrix.md`
- Create: `docs/superpowers/plans/2026-09-09-cycle-3-bottlecrm-engine-adoption.md`

**Produces:** A stable evaluation vocabulary, scope, non-regression rules and microdelivery sequence.

- [x] **Step 1:** Record the approved upstream-engine model and current Axesistemas baseline.
- [x] **Step 2:** Define ADOPT/ADAPT/KEEP_AXES/REPLACE/IGNORE classifications.
- [x] **Step 3:** Record the preliminary capability matrix.
- [x] **Step 4:** Decompose Cycle 3 into independently gated microdeliveries.
- [ ] **Step 5:** Review the three documents for contradictions, placeholders and accidental production changes.
- [ ] **Step 6:** Open a draft PR for C3.0 and verify that its diff contains documentation only.

### Task 2: C3.1 — Evidence-backed gap analysis

**Files:**
- Modify: `docs/architecture/2026-09-09-bottlecrm-adoption-matrix.md`
- Create: `docs/architecture/2026-09-09-bottlecrm-gap-analysis.md`

**Consumes:** C3.0 classification vocabulary and Axesistemas Cycle 2 baseline.

**Produces:** Evidence-backed recommendations for C3.2 with dependency, migration and test impact.

- [ ] **Step 1:** Inventory BottleCRM modules, models, APIs, tenant boundaries, permissions, async services and frontend boundaries from source.
- [ ] **Step 2:** Inventory matching Axesistemas modules and contracts from the current `main` baseline.
- [ ] **Step 3:** Map organization/tenant, identity/RBAC, accounts, contacts, leads, opportunities, activities, tags, custom fields, audit and attachments field-by-field and behavior-by-behavior.
- [ ] **Step 4:** Record license/provenance, dependency and operational impact for every ADOPT/ADAPT candidate.
- [ ] **Step 5:** Identify Cycle 0–2 regression tests required before any REPLACE candidate can proceed.
- [ ] **Step 6:** Commit the gap-analysis checkpoint without production code changes.

### Task 3: C3.2 — Axesistemas Engine architecture decision

**Files:**
- Create: `docs/decisions/ADR-0002-bottlecrm-engine-adoption.md`
- Modify: `docs/architecture/2026-09-09-bottlecrm-adoption-matrix.md`

**Consumes:** C3.1 evidence.

**Produces:** A frozen choice between selective adoption, backend adoption or hybrid architecture, including data and API boundaries.

- [ ] **Step 1:** Compare three options: selective concept/code adoption behind current stack; BottleCRM backend adoption behind Axes contracts; hybrid transitional architecture.
- [ ] **Step 2:** Score migration cost, security, RLS, maintainability, testability, deployment complexity, data compatibility and future connector/AI needs.
- [ ] **Step 3:** Select one architecture and explicitly reject the alternatives with reasons.
- [ ] **Step 4:** Define authoritative tenant context, database boundary, API boundary and migration sequence.
- [ ] **Step 5:** Obtain explicit architecture approval before behavior-changing implementation begins.

### Task 4: C3.3 — Multi-tenant/RLS foundation

**Files:** Determined by ADR-0002; do not create until C3.2 freezes the architecture.

**Produces:** Database-enforced organization isolation where approved, while preserving application-level organization scoping.

- [ ] **Step 1:** Write a failing cross-organization integration test proving the intended database isolation boundary.
- [ ] **Step 2:** Run the focused test and record the expected failure before implementation.
- [ ] **Step 3:** Implement the minimum RLS/tenant-context mechanism selected by ADR-0002.
- [ ] **Step 4:** Run focused isolation tests and then the full Cycle 1–2 regression suite.
- [ ] **Step 5:** Document migration, rollback and operational tenant-context requirements.
- [ ] **Step 6:** Commit and stop at the C3.3 approval gate.

### Task 5: C3.4–C3.12 — Domain adoption sequence

**Files:** Determined per microdelivery from C3.1/C3.2 mappings.

**Produces:** Incremental alignment of identity/RBAC, companies, contacts, leads, opportunities, activities, extensibility, audit/security and integration contracts.

- [ ] **Step 1:** For each microdelivery, identify the exact BottleCRM capability classification and existing Axes contract.
- [ ] **Step 2:** Add failing compatibility/domain tests before implementation.
- [ ] **Step 3:** Implement only the minimum approved ADOPT/ADAPT/REPLACE change.
- [ ] **Step 4:** Run focused tests plus all affected Cycle 0–2 regressions.
- [ ] **Step 5:** Update the adoption matrix and changelog with the actual decision.
- [ ] **Step 6:** Stop at an independent review/approval gate before moving to the next microdelivery.

### Task 6: C3.13–C3.14 — AI foundation and Axesistemas UI

**Files:** Determined only after core engine contracts stabilize.

**Produces:** Permissioned/audited AI integration foundations where approved and the Axesistemas Wireframe A product experience over the selected engine.

- [ ] **Step 1:** Keep AI/MCP/RAG optional and behind explicit authorization/audit boundaries.
- [ ] **Step 2:** Preserve Axesistemas UI/branding as authoritative; do not import BottleCRM UI as the product shell.
- [ ] **Step 3:** Add contract/E2E tests for engine-to-UI behavior before replacing existing screens.
- [ ] **Step 4:** Verify accessibility, responsive behavior, session restoration and organization isolation.
- [ ] **Step 5:** Stop at the independent C3.14 gate.

### Task 7: C3.15–C3.16 — Compatibility, final verification and homologation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify/add testing and operational documentation according to the selected architecture.

**Produces:** A migration-ready, documented Cycle 3 candidate that can be compared against the last homologated main checkpoint.

- [ ] **Step 1:** Execute complete Cycle 0–2 regression and Cycle 3 test suites on the same candidate commit.
- [ ] **Step 2:** Validate database migrations from representative pre-C3 data and test rollback/recovery procedures where supported.
- [ ] **Step 3:** Validate build, containers, configuration, secrets handling, health checks and observability.
- [ ] **Step 4:** Update README, architecture, operations manual and changelog.
- [ ] **Step 5:** Record the exact candidate SHA and all gate results.
- [ ] **Step 6:** Request explicit homologation/merge approval; do not merge automatically.

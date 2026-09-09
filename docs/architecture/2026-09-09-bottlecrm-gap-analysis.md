# BottleCRM × Axesistemas Gap Analysis — C3.1

## Purpose

Convert the C3.0 preliminary adoption matrix into evidence-backed engineering decisions before any BottleCRM-derived production code is introduced.

## Baseline

Axesistemas authority is the Cycle 2 state integrated into `main` at `d98835b0f7ccc656e12d83be071d54d2f46b7790`. BottleCRM is an upstream/reference candidate. Existing Axesistemas behavior is not considered obsolete merely because BottleCRM has an equivalent capability.

## Evaluation method

Each capability is evaluated on eight dimensions: domain fit, tenant isolation, authorization, API/contract compatibility, data migration, dependency/operations impact, regression-test impact, and provenance/license obligations.

A final `REPLACE` classification requires an explicit measurable advantage over the current implementation plus a migration and regression strategy. Otherwise the default is ADAPT or KEEP_AXES.

## First-pass gaps

### Tenant isolation

Axesistemas currently derives organization scope from the authenticated session and applies `organizationId` scoping in services. The target evaluation is defense-in-depth: retain trusted application tenant context while determining whether PostgreSQL RLS can enforce the same boundary at the database layer. Client-provided organization identifiers must never become authorization authority.

**Current direction:** ADAPT.

### Identity and authentication

Axesistemas Cycle 1 already has Argon2id credentials, short-lived JWT access, opaque rotating refresh tokens, membership validation, logout/revocation behavior and audit requirements. Replacing this subsystem has high regression/security cost unless BottleCRM demonstrates a concrete improvement that can preserve these contracts.

**Current direction:** KEEP_AXES; import only demonstrably useful security patterns.

### RBAC and organizations

Axesistemas has global users, organization memberships, fixed roles and explicit permissions. BottleCRM team/role concepts may add value, but they must not weaken organization isolation or current permission semantics.

**Current direction:** ADAPT.

### Companies/accounts and contacts

Axesistemas Cycle 2 already supports companies, independent contacts, channels, company-contact relationships, soft deletion, organization scoping and history. BottleCRM equivalents should be treated primarily as model/workflow references until field-level comparison proves replacement value.

**Current direction:** ADAPT for companies/contacts; KEEP_AXES for independent-contact/channel/link semantics until proven otherwise.

### Leads and opportunities

These are natural next-domain candidates because they extend the approved CRM direction without requiring replacement of the existing core. BottleCRM can accelerate the domain model if its lifecycle, ownership, stage and tenant semantics fit Axesistemas contracts.

**Current direction:** ADOPT candidate, subject to C3.2 architecture decision.

### Activities/tasks/history

Axesistemas already has relationship history; a richer activity/task model can complement it. The evaluation must prevent duplicate sources of truth and define whether history is an immutable projection, an activity aggregate, or separate audit/business concepts.

**Current direction:** ADAPT.

### Tags/custom fields/attachments

Tags and custom fields already exist and remain organization-scoped. Attachments can be evaluated as a new capability, but storage authorization, audit, size/type validation and malware-handling boundaries must be defined before adoption.

**Current direction:** ADAPT for tags/custom fields; ADOPT candidate for attachments.

### Audit and asynchronous processing

Axesistemas append-only auditing is a security requirement and remains authoritative. Async infrastructure is introduced only for concrete workloads; adopting Celery/Redis or an equivalent queue solely because upstream uses it would violate YAGNI.

**Current direction:** ADAPT audit; IGNORE async infrastructure until justified by an approved workload.

### UI

Axesistemas Wireframe A and product identity remain authoritative. BottleCRM UI can inform interaction patterns but is not the target product shell.

**Current direction:** IGNORE as product UI.

## Architecture options for C3.2

1. **Selective adoption behind the current stack — preferred starting hypothesis.** Preserve Next.js/NestJS/Prisma and port/adapt BottleCRM domain and RLS ideas where they provide measurable value. Lowest migration risk and strongest continuity with Cycle 0–2.
2. **BottleCRM backend adoption behind Axesistemas contracts.** Adopt Django/DRF and its persistence model as the engine while preserving Axesistemas-facing contracts. Potentially higher upstream reuse, but substantially higher migration, dual-stack and regression cost.
3. **Hybrid transitional engine.** Run current and BottleCRM-derived services behind explicit boundaries during migration. Useful only if a staged backend replacement is selected; otherwise it adds avoidable operational complexity.

C3.2 must score these options before implementation. No option is approved by this document alone.

## Evidence still required before C3.1 closes

The next pass must inspect BottleCRM source paths/models/migrations/API permissions and current Axesistemas Prisma/services/tests side by side, then append concrete evidence to the adoption matrix. This document intentionally does not declare framework replacement or production-code adoption before that source-level comparison.

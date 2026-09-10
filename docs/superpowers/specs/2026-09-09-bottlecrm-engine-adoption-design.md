# C3.2 — BottleCRM Engine Adoption Design

## Status

Proposed architecture for explicit review before production implementation.

## Goal

Use BottleCRM/Django-CRM as the mature upstream reference/engine base for CRM domain behavior while preserving Axesistemas as the runtime, product, security and integration authority.

## Decision

Axesistemas keeps the existing Next.js + NestJS + Prisma + PostgreSQL architecture. BottleCRM/Django-CRM is consumed selectively: domain models, workflow ideas, tenant-isolation patterns and proven CRM behavior are ported/adapted behind Axesistemas contracts when they provide measurable value.

We will not introduce Django/DRF as a second production backend in this cycle and will not rewrite Cycle 0–2 merely to align frameworks.

## Architecture boundary

```text
Axesistemas UI (Wireframe A / Next.js)
        |
Axesistemas API contracts (NestJS)
        |
Axesistemas CRM application/domain modules
        |          \
        |           -> Axesistemas integrations/adapters
        |
Prisma + PostgreSQL
        |
Application tenant scope + PostgreSQL RLS

BottleCRM/Django-CRM upstream
        |
        -> domain/workflow/security patterns selected through C3 adoption matrix
```

BottleCRM is therefore an upstream engine/reference, not a second runtime source of truth.

## Authoritative Axesistemas contracts

The following remain Axesistemas-owned: authentication/session lifecycle, organization membership and authorization, public/internal API contracts, independent contacts and contact channels, company-contact linking, relationship history, append-only audit, integration contracts, product branding and Wireframe A.

## Tenant isolation

All tenant-owned reads and writes continue to derive organization scope from authenticated server-side context. PostgreSQL RLS is added as defense in depth. The application database role must not be a superuser or otherwise bypass RLS. Missing/invalid tenant context must fail closed. Cross-tenant tests are mandatory before RLS can be considered complete.

## BottleCRM capability intake

### Adapt

- PostgreSQL RLS strategy.
- Organization/team ownership patterns where compatible with existing RBAC.
- Commercial Account fields needed by approved flows.
- Activity/task concepts without replacing audit/history.
- Tags/custom-field improvements where measurable.

### Adopt as domain patterns

- Leads: lifecycle, source/status, ownership, follow-up, probability/value, stages and Kanban ordering.
- Opportunities: stages, amount/probability, account/contact links, ownership, expected close date and Kanban ordering.

### Keep Axesistemas

- Authentication and refresh-token model.
- Organization memberships and current permissions.
- Companies/contacts core semantics from Cycle 2.
- Contact channels and company-contact links.
- Audit and API contracts.
- UI/product identity and integrations.

### Deferred

- Cases/tickets.
- Celery/Redis until an approved async workload requires a queue.
- Opportunity line items, sales goals and advanced aging.
- Attachments until storage/security design is approved.
- BottleCRM/Svelte product UI.
- UI variants B/C.

## Data and migration strategy

Cycle 0–2 PostgreSQL data remains authoritative. New capabilities extend the current schema through Prisma migrations. No destructive framework migration is planned. Existing identifiers and organization ownership remain stable. Any future field remapping must be additive first and include rollback/backfill strategy before destructive cleanup is considered.

## API strategy

Existing Axesistemas contracts remain stable. New Lead and Opportunity endpoints follow the repository's established NestJS conventions and derive tenant context server-side. Upstream field names are not exposed merely because BottleCRM uses them; Axesistemas naming and contracts are selected deliberately.

## Security and audit

Every new tenant-owned aggregate must be covered by application authorization and RLS. Security-sensitive mutations produce Axesistemas audit events. No client-supplied organization ID can select authorization scope. Derived/adapted upstream code must undergo the same lint, type, unit, integration and cross-tenant gates as native Axesistemas code.

## Provenance

BottleCRM/Django-CRM source is MIT-licensed upstream reference. Conceptual reimplementations record upstream references in architecture/changelog documentation. Any copied or substantially adapted source must retain the applicable MIT copyright/permission notice and record upstream repository, source path and source commit. Provenance is reviewed before merge.

## Implementation sequence

C3 implementation is split into independently reviewable microdeliveries:

1. C3.3 — RLS foundation and tenant-context fail-closed tests.
2. C3.4 — Lead domain minimum vertical slice.
3. C3.5 — Lead pipeline/stages and Kanban ordering.
4. C3.6 — Opportunity minimum vertical slice.
5. C3.7 — Opportunity pipeline/Kanban integration.
6. C3.8 — commercial account-field adaptations required by approved Lead/Opportunity flows.
7. C3.9 — Cycle 3 regression/security/provenance gate and documentation checkpoint.

Tasks/activities and attachments remain separate future specs rather than being silently bundled into Cycle 3.

## Testing strategy

Before changing tenant behavior, retain characterization/regression coverage for Cycle 1/2 contracts. Each microdelivery follows RED → GREEN → REFACTOR. RLS work must prove same-tenant success, cross-tenant invisibility/denial, missing-context fail-closed behavior and non-bypass application DB role assumptions. Lead/Opportunity work must prove organization isolation, authorization, validation, lifecycle transitions and API contract behavior. The full repository gate runs before any merge request is approved.

## Rollback

Each microdelivery is additive and independently revertible. RLS deployment must support rollback of policies separately from schema/data changes. Lead/Opportunity tables and endpoints are introduced without destructive changes to Company/Contact. No Cycle 0–2 table is dropped as part of BottleCRM adoption.

## Success criteria

The design succeeds when Axesistemas gains BottleCRM-inspired mature CRM behavior without duplicate production engines, existing Cycle 0–2 behavior remains green, tenant isolation is stronger through RLS, new commercial aggregates use Axesistemas contracts/UI, provenance is traceable, and each microdelivery can be reviewed and reverted independently.

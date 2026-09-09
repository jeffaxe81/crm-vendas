# Cycle 3 — BottleCRM Engine Adoption Design

## Status

Approved direction for Cycle 3. This specification records the decision to evaluate BottleCRM as the upstream CRM engine and adapt it to the Axesistemas product scope without blindly replacing the homologated CRM.

## Goal

Evolve CRM Axesistemas using BottleCRM as an upstream engine/reference, selectively adopting mature CRM capabilities while preserving Axesistemas product identity, approved requirements, integration contracts, security requirements, tests and the functional behavior homologated through Cycle 2.

## Architectural model

BottleCRM upstream -> Axesistemas Engine -> Axesistemas CRM -> vertical modules and integrations.

BottleCRM is not the final product and must not dictate Axesistemas domain decisions automatically. Every imported concept or implementation must be classified and adapted before production use.

## Current Axesistemas baseline

The homologated baseline is Cycle 2 (`v0.2.0-crm-core` candidate integrated in main), currently based on Next.js, NestJS, Prisma and PostgreSQL. It already covers organization-scoped identity/access, companies, independent contacts, contact channels, company-contact relationships, relationship history, tags, custom fields, auditing and authenticated application shell.

No Cycle 0–2 behavior may be discarded without an explicit compatibility decision and regression coverage.

## Adoption classification

Every BottleCRM capability evaluated in Cycle 3 receives exactly one classification:

- `ADOPT`: reusable with minimal Axesistemas-specific change.
- `ADAPT`: useful foundation that requires domain, security, API, UX or operational changes.
- `KEEP_AXES`: existing Axesistemas implementation remains authoritative.
- `REPLACE`: BottleCRM-derived implementation is selected to supersede an Axesistemas implementation after compatibility tests and migration design.
- `IGNORE`: capability is outside the approved scope or creates unnecessary coupling/complexity.

## Initial evaluation scope

C3 evaluates organization/tenant isolation, PostgreSQL RLS, identity, RBAC/teams, accounts/companies, contacts, leads, opportunities/pipeline, activities/tasks, cases/tickets, relationship history, tags, custom fields, attachments, auditing, APIs, asynchronous jobs and AI/MCP/RAG-enabling foundations where applicable.

Integrations and differentiators remain Axesistemas concerns, including PABX/NEO/UNA/Asterisk/Intelbras, WhatsApp, e-mail, connectors, event contracts, onboarding, guided help, observability, product UX and future vertical modules.

## Technology decision gate

Cycle 3 does not assume an immediate replacement of Next.js/NestJS/Prisma by SvelteKit/Django/DRF. C3.0–C3.2 must compare reuse value, migration cost, security, maintainability, testability, data compatibility and operational complexity. The implementation architecture is frozen only after this gate.

## Multi-company requirement

Multi-company isolation is mandatory. The evaluation must compare the current application-level `organizationId` scoping with database-enforced PostgreSQL Row Level Security and define a defense-in-depth target. Organization context must never be freely selected by client payload to authorize access.

## Compatibility and migration rules

1. Main remains untouched during evaluation and implementation work.
2. Work occurs in isolated Cycle 3 branches and controlled pull requests.
3. Changes are delivered as independently reviewable microdeliveries.
4. TDD is required for behavior changes.
5. Existing Cycle 0–2 behavior receives regression coverage before replacement.
6. Data migration must be explicit, reversible where practical and tested with representative fixtures.
7. API/event contracts are treated as product contracts, not incidental implementation details.
8. New dependencies require justification and reproducible locking.
9. Security, auditing, observability and documentation are part of the delivery gate.
10. No merge to main occurs without green gates and explicit approval.

## Cycle 3 microdeliveries

- C3.0 — BottleCRM Engine Adoption Baseline: inventory, adoption criteria and architectural baseline; no production behavior change.
- C3.1 — Gap Analysis: capability-by-capability matrix between BottleCRM and Axesistemas.
- C3.2 — Axesistemas Engine Architecture Decision: choose full, selective or hybrid adoption and record ADRs.
- C3.3 — Multi-tenant/RLS foundation.
- C3.4 — Identity/RBAC/Organizations alignment.
- C3.5 — Accounts/Companies alignment.
- C3.6 — Contacts/channels/relationships alignment.
- C3.7 — Leads.
- C3.8 — Opportunities and sales pipeline.
- C3.9 — Activities/tasks/relationship history.
- C3.10 — Tags/custom fields/attachments.
- C3.11 — Auditing and security hardening.
- C3.12 — Axesistemas integration API/event contracts.
- C3.13 — AI/MCP/RAG foundation, only where justified by approved product scope.
- C3.14 — Axesistemas UI adaptation over the selected engine architecture.
- C3.15 — Cycle 0–2 compatibility and migration gate.
- C3.16 — Integral verification, documentation, changelog and homologation gate.

## C3.0 acceptance criteria

C3.0 is complete when the BottleCRM evaluation scope is documented; the ADOPT/ADAPT/KEEP_AXES/REPLACE/IGNORE classification is defined; the current Axesistemas baseline and non-regression rule are explicit; the multi-company/RLS decision is identified as an architectural gate; Cycle 3 is decomposed into microdeliveries; and no production code has been changed as part of C3.0.

## Out of scope for C3.0

No framework migration, schema migration, RLS activation, endpoint replacement, UI replacement, BottleCRM source import or production dependency addition occurs in C3.0.

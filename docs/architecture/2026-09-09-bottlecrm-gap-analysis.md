# BottleCRM × Axesistemas Gap Analysis — C3.1

## Purpose

Convert the C3.0 preliminary adoption matrix into evidence-backed engineering decisions before any BottleCRM-derived production code is introduced.

## Baseline

Axesistemas authority is the Cycle 2 state integrated into `main` at `d98835b0f7ccc656e12d83be071d54d2f46b7790`. BottleCRM/Django-CRM is an upstream/reference source. Existing Axesistemas behavior is not obsolete merely because upstream has an equivalent capability.

## Source-level findings

### Tenant isolation — ADAPT

Axesistemas already derives organization scope from authenticated context and stores `organizationId` across CRM business records. Upstream also models organization ownership explicitly and documents PostgreSQL Row-Level Security as defense in depth. The Axesistemas target therefore keeps application-level tenant scoping and adds database-level RLS rather than replacing trusted tenant context.

Required invariant: a client-provided organization identifier is never authorization authority. Database sessions used by the application must not bypass RLS. Missing tenant context must fail closed for tenant-owned data.

### Identity and authentication — KEEP_AXES

Cycle 1 authentication remains authoritative: Argon2id credentials, short-lived JWT access, opaque rotating refresh tokens, membership validation, revocation/logout behavior and append-only audit. Replacing it with upstream identity code would create security regression risk without a demonstrated product advantage.

### RBAC and organizations — ADAPT

Upstream organization/team/profile concepts are useful references for future delegation and team ownership. Axesistemas fixed roles, explicit permissions and organization memberships remain the contract. Any future team model must compose with those permissions rather than bypass them.

### Companies/accounts and contacts — ADAPT / KEEP_AXES

Upstream Account adds useful commercial attributes such as industry, employees, annual revenue, currency, address, assignment/team ownership and custom fields. Those are candidates for selective adaptation.

Axesistemas keeps its current independent Contact model, contact channels, explicit company-contact links, soft deletion, organization scoping and relationship history. These Cycle 2 semantics are already homologated and are not replaced merely to match upstream naming.

### Leads — ADOPT DOMAIN PATTERNS

Upstream Lead provides useful patterns for source, status, rating, expected value, probability, expected close date, ownership, follow-up, tags, custom fields, pipeline stages, Kanban ordering and stale/follow-up calculations. Axesistemas should port the useful domain behavior into its own contracts and stack rather than introduce a second framework solely to reuse the model implementation.

### Opportunities / sales pipeline — ADOPT DOMAIN PATTERNS

Upstream Opportunity provides a strong reference for stage, amount, probability, expected close date, account/contact relationships, assignment, tags, custom fields, Kanban ordering, stage aging and optional line items/goals. The first Axesistemas implementation should stay intentionally smaller: opportunity, configurable stages/pipeline, ownership, amount/probability, expected close date and Kanban ordering. Line items, sales goals and advanced aging remain backlog unless separately approved.

### Activities/tasks/history — ADAPT

Relationship history remains an Axesistemas business-history source. A future task/activity aggregate must not duplicate audit events or silently become a second history authority. Audit, business history and actionable tasks remain distinct concepts with explicit links.

### Tags/custom fields/attachments — ADAPT

Existing organization-scoped tags and custom fields remain authoritative. Attachments are a future adoption candidate only after storage authorization, content-type/size validation, audit and malware-handling boundaries are designed.

### Audit and asynchronous processing — KEEP_AXES / DEFER

Append-only Axesistemas auditing remains mandatory. Redis/Celery or another queue is not introduced just because upstream uses asynchronous infrastructure; an approved workload must justify the dependency.

### UI — KEEP_AXES

Wireframe A and Axesistemas product identity remain authoritative. Upstream UI is a UX reference only.

## C3.2 architecture decision recommendation

Three options were evaluated:

| Option                                      | Reuse                        | Migration risk | Operational complexity | Cycle 0–2 continuity | Decision                                            |
| ------------------------------------------- | ---------------------------- | -------------- | ---------------------- | -------------------- | --------------------------------------------------- |
| Selective adoption in Next.js/NestJS/Prisma | High at domain/pattern level | Low            | Low                    | High                 | **RECOMMENDED**                                     |
| Replace backend with Django/DRF             | High at source-code level    | High           | High                   | Low                  | Reject for current cycle                            |
| Transitional dual backend                   | Medium/High                  | High           | Very high              | Medium               | Reject unless a future full replacement is approved |

**Recommended architecture:** BottleCRM/Django-CRM is the upstream engine/reference for mature CRM domain patterns; Axesistemas remains the product and runtime authority using Next.js + NestJS + Prisma + PostgreSQL. We port/adapt capabilities behind Axesistemas contracts instead of maintaining two CRM engines.

This interpretation satisfies the product intent of using BottleCRM as the engine base while preserving the already homologated Axesistemas foundation and avoiding a framework rewrite with no demonstrated user benefit.

## First implementation sequence after ADR approval

1. Add PostgreSQL RLS defense in depth for tenant-owned tables, with cross-tenant and missing-context tests.
2. Add Leads using selected upstream domain patterns and Axesistemas contracts.
3. Add Opportunity/Pipeline/Kanban as the next commercial aggregate.
4. Extend company/account commercial fields only when required by those flows.
5. Evaluate tasks/activities and attachments as separate later microdeliveries.

Each step must use TDD, preserve existing API/security behavior, remain reversible, and pass the complete regression gate before merge.

## Provenance and license

When implementation is inspired only by concepts or independently reimplemented behavior, record upstream references in architecture/changelog documentation. If code or substantial portions are copied or adapted from MIT-licensed upstream source, preserve the applicable copyright and MIT permission notice and record the source path/commit used. Do not mix provenance silently.

## C3.1 exit criteria

C3.1 is complete when this source-level comparison, the adoption matrix and the C3.2 ADR agree on the runtime strategy and no production framework replacement is implied by the term “engine”. Production implementation starts only from the approved ADR/implementation plan.

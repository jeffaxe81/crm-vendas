# C3.4 Sales Pipeline Stages Design

## Goal

Establish the tenant-aware sales pipeline foundation used by opportunities without introducing a parallel CRM architecture.

## Scope

C3.4 introduces `Pipeline` and `PipelineStage` as organization-scoped domain entities. It does not implement the full opportunity lifecycle yet; opportunities will consume these contracts in the following microdeliveries.

## Domain model

`Pipeline` belongs to exactly one organization and contains ordered stages. A pipeline has a name, active flag, timestamps and organization ownership.

`PipelineStage` belongs to exactly one pipeline and organization. It has a stable name, integer position, terminal classification and active flag. The initial default stages follow RN-07: Prospecção, Qualificação, Proposta, Negociação, Ganha and Perdida.

Terminal stages use an explicit classification: `OPEN`, `WON`, `LOST`. Prospecção through Negociação are `OPEN`; Ganha is `WON`; Perdida is `LOST`.

## Tenant isolation

Both tables carry `organization_id`. PostgreSQL RLS is enabled and forced, using the same `app.current_organization_id` session setting established in C3.3. Reads and writes fail closed when tenant context is absent or mismatched. No application role receives `BYPASSRLS`.

The API accesses pipeline data only through `PrismaService.withTenant(...)`.

## Invariants

- Pipeline names are unique per organization after normalization at the application boundary.
- Stage position is unique inside a pipeline.
- A stage organization must match its pipeline organization.
- Pipeline deletion is not physical in the MVP; disabling uses `is_active`.
- Stage deletion is not part of C3.4. Reordering and custom stage editing remain future work unless needed by the opportunity flow.
- Default stages are seeded per organization only through an idempotent service operation; no global shared pipeline is created.

## API contract

C3.4 exposes read-oriented pipeline endpoints plus a controlled bootstrap operation required by the MVP:

- `GET /api/v1/pipelines` — list active pipelines with ordered stages for the authenticated organization.
- `POST /api/v1/pipelines/default` — idempotently create the default sales pipeline for the authenticated organization when one does not exist.

Creation of arbitrary custom pipelines/stages is deliberately deferred. This keeps the first delivery small and aligned with RN-07 while preserving the schema for future configuration.

## Authorization and audit

Authenticated organization members can read pipelines. The default-pipeline bootstrap requires an administrative or manager-capable permission consistent with the current authorization layer. Creation emits an audit event with organization, actor and request id.

## Acceptance criteria

1. Two organizations can each have independent pipelines and identical stage names without collision.
2. Missing tenant context cannot read or write pipeline/stage rows.
3. Organization A cannot read or mutate Organization B pipeline data.
4. Default bootstrap is idempotent and creates exactly six stages in RN-07 order.
5. Stage terminal classifications are OPEN, OPEN, OPEN, OPEN, WON, LOST.
6. Formatting, lint, typecheck, unit/integration tests, E2E/Compose checks and image builds remain green.

## Non-goals

Full Opportunity CRUD, drag-and-drop stage movement, custom pipeline editor, stage probability, automation triggers, analytics and workflow rules are outside C3.4.

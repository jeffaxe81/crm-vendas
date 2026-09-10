# Checkpoint — C3.6.2 Opportunity API Design

## Estado

- branch: `feat/c3-6-2-opportunity-api`;
- base empilhada: C3.6.1 head `40d20a6b11ca8db973cc3fa817801f759aef19bb`;
- implementação funcional: não iniciada;
- gate atual: revisão explícita da especificação escrita.

## Decisão registrada

A C3.6.2 exporá Opportunity por API REST tenant-aware seguindo o padrão modular de Activities, com contratos Zod, controller NestJS, service, `PrismaService.withTenant()`, RBAC e AuditService.

A edição cadastral e a movimentação de etapa serão contratos separados:

- `opportunity.write` para create/update/delete;
- `opportunity.move` para `PATCH /opportunities/:id/stage`;
- `opportunity.read` para list/read.

PATCH cadastral e movimentação usarão `version` como CAS de concorrência otimista. `estimatedValue` será representado como string decimal no contrato público. Movimentação entre pipelines, Web/Kanban e Activity -> Opportunity permanecem fora do escopo.

## Próximo gate

Após aprovação explícita da spec `docs/superpowers/specs/2026-09-10-c3-6-2-opportunity-api-design.md`, criar plano de implementação e iniciar a primeira fatia TDD em RED. Nenhuma implementação funcional deve ocorrer antes desse gate.

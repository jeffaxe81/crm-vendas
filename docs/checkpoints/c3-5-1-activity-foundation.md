# C3.5.1 — Activity Foundation Checkpoint

Status: implementação concluída no branch; merge pendente de gate final e aprovação explícita.

Branch: `feat/c3-5-activities-foundation`.

PR: `#11 — C3.5.1 — Tenant-aware activity foundation`.

Base: `main` no commit `903bc7d399f827bc5bf85fca7ac03bc50fe4a82f`.

Spec: `docs/superpowers/specs/2026-09-10-c3-5-activities-design.md`.

Plano: `docs/superpowers/plans/2026-09-10-c3-5-1-activity-foundation.md`.

## TDD

### RED funcional

SHA: `b4671133a977d55904fc3bd0a2dc1a0709321187`.

O gate executou formatação, lint e typecheck com sucesso e falhou nos dois testes de contrato C3.5.1 porque o schema ainda não continha `Activity` e a migration `c3_activity_foundation` ainda não existia.

Um RED anterior em `e24e16208254388ec883e4a5335cd1bb5cd794cd` foi descartado como evidência funcional porque parou no Prettier antes do teste de domínio.

### GREEN funcional

SHA candidato funcional: `1e655b8324d2f1ea736d5faec7299579ddc576b8`.

GitHub Actions: run `34457751047` / gate `#429`.

Resultado: GREEN integral em Prisma generate, deploy de migrations, papel de aplicação, source/tests, E2E, contrato Compose e build das imagens.

## Entregue

- enums `ActivityType`, `ActivityStatus` e `ActivityPriority`;
- model canônico `Activity` no Prisma;
- tipos `TASK` e `APPOINTMENT`;
- estados `PENDING`, `COMPLETED` e `CANCELLED`;
- prioridades `LOW`, `MEDIUM` e `HIGH`;
- responsável obrigatório e prazo opcional;
- rastreabilidade `createdBy`, `updatedBy`, `deletedAt`, `deletedBy`;
- vínculos opcionais com Company e Contact;
- migration `20260910090000_c3_activity_foundation`;
- índices tenant-aware para status/prazo, responsável/status/prazo, empresa e contato;
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`;
- policy `activities_tenant_isolation` baseada em `app.current_organization_id`;
- teste comportamental de ausência de contexto, isolamento entre tenants e bloqueio de escrita cross-tenant.

## Decisões preservadas

- `organizationId` não é fonte confiável do cliente; contexto de tenant continua sendo responsabilidade da sessão/transação.
- Não foi criada relação com Opportunity porque esse domínio ainda não existe no modelo canônico da `main` usada como base da C3.5.1.
- O código legado tRPC/Manus permanece apenas como referência funcional e não foi promovido à arquitetura canônica.

## Fora do escopo

- API REST de atividades;
- interface Web de atividades;
- agenda visual;
- recorrência;
- Google Calendar/Outlook;
- notificações externas;
- automação autônoma de follow-up;
- vínculo com Opportunity.

## Gate final

Após este checkpoint documental, um novo SHA deve receber o gate integral `verify`. Somente `conclusion=success` no SHA exato autoriza apresentar o PR para aprovação de merge.

A C3.5.1 não deve ser merged automaticamente.

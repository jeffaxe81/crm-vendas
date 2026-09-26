# Checkpoint — C5.2 Filas de atendimento e atribuição

Data: 26/09/2026
Branch: `feat/c5-2-queues-assignment` (a partir de `phase-3-atendimento`)
Design: `docs/superpowers/specs/2026-09-23-c5-2-queues-assignment-design.md`
Status: implementada e validada localmente pelo gate completo (banco limpo `axes_crm_a`).

## Construído

- migration `20260926130000_c5_2_support_queues`: tabela `support_queues` com `FORCE ROW LEVEL SECURITY`, autoria, `version`, exclusão lógica e índice único parcial `(organization_id, lower(name)) WHERE deleted_at IS NULL`; `tickets.queue_id` por `ALTER TABLE` com FK composta por tenant e índice `(organization_id, queue_id, deleted_at, status)`. Sem mudança de enum;
- `schema.prisma`: model `SupportQueue` no fim do arquivo; `queueId`/`queue` no fim de `Ticket`; relações novas no fim de `Organization` e `User`; client regenerado;
- permissão `support.manage` (ADMIN e MANAGER);
- API `/api/v1/support-queues` (listar com `openTicketCount` e filtro `active`, consultar, criar, editar com `version`, excluir logicamente com 409 `SUPPORT_QUEUE_HAS_OPEN_TICKETS`), auditoria `support_queue.*`;
- solicitações: `queueId` na abertura e edição (fila do tenant, não excluída e ativa), filtro `queueId`, `assigneeUserId=me`, `POST /tickets/:id/assign-to-me { version }` (200, idempotente, auditoria `ticket.assigned_to_me`), evento `UPDATED` com `{ fields: ["queueId"], fromQueueId, toQueueId }` na troca de fila;
- distribuição automática (`autoAssign`) na abertura sem responsável: membro ativo com `ticket.write` e menos solicitações abertas (`OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`) na fila; desempate pela membership mais antiga e depois pelo menor `user_id`; lock consultivo por fila contra corrida; evento `ASSIGNED` com `autoAssigned: true`;
- contratos: `packages/contracts/src/support-queues.ts` e extensões em `tickets.ts` (`TICKET_OPEN_STATUSES`, `TicketAssignToMeInputSchema`, `queueId`, `me`);
- web (Atendimento): painel **Gerenciar filas** (com `support.manage`), filtro por fila, atalho **Minhas solicitações**, fila na abertura, coluna Fila, fila/responsável e botão **Assumir** no detalhe, descrição de troca de fila e atribuição automática na timeline.

## Evidência de testes (local, banco limpo)

- `npx prettier --check .`: só `.github/workflows/ci.yml` (CRLF preexistente); `pnpm lint` e `pnpm typecheck` OK;
- API: 51 suítes / 225 testes (antes 50/218): `support-queues.integration` 6 novos (CRUD com permissões e auditoria; unicidade por tenant sem caixa, isolamento por HTTP, RLS e FK composta; vínculo de solicitação a fila, timeline da troca, bloqueio de exclusão; assign-to-me e `assigneeUserId=me`; auto-assign com desempate; 6 aberturas concorrentes distribuídas 2/2/2) e 1 de permissões;
- contratos: 54 (6 novos); web: 93 (7 novos, e os 3 testes da C5.1 migrados para mock de fetch roteado por URL); `pnpm test:repo` 6/6; `pnpm build` OK.
- E2E não executado (regra do ambiente: sem servidores nas portas 3000/3001).

## Decisões preservadas

- troca de fila registrada como `UPDATED` com metadata, sem novo valor no enum `ticket_event_type` (evita migration de enum concorrente com C5.3/C5.4);
- "abertas" = `TICKET_OPEN_STATUSES`; solicitações resolvidas/encerradas mantêm `queueId` histórico mesmo com a fila excluída;
- a validação de fila só roda quando a fila muda: solicitações antigas numa fila desativada continuam editáveis;
- `assign-to-me` responde 200 (ação sem criação de recurso), diferente de `status`/`comments` (201, padrão da C5.1).

## Fora do escopo

Membros por fila, redistribuição (troca de fila, membro desativado, capacidade/horário), SLA por fila (C5.3), roteamento automático por canal/assunto e nome do responsável no detalhe.

## Pontos de atenção para o merge

- `apps/api/src/generated/prisma/client/*` e `schema.prisma` conflitam com C5.3/C5.4: resolver o `schema.prisma` unindo os blocos (campos novos estão no fim de cada model) e regenerar o client;
- testes de integração de outras entregas que fazem `TRUNCATE … organizations CASCADE` já limpam `support_queues` pela cascata;
- `tickets.service.ts` e as telas de Atendimento foram alterados; conferir junto com as mudanças de SLA/CSAT.

## Próximo passo

Integrar em `phase-3-atendimento` após revisão; em seguida, avaliar membros por fila e SLA por fila sobre a C5.3.

# Checkpoint — C5.1 Fundação de Atendimento (solicitações com protocolo)

Data: 26/09/2026
Branch: `feat/c5-1-tickets-foundation` → integrada em `phase-3-atendimento` (fora da `develop` até o fechamento oficial da Fase 2)
Design: `docs/superpowers/specs/2026-09-26-fase-3-atendimento-design.md`
Status: implementada e validada localmente pelo gate completo.

## Construído

- migration `20260926120000_c5_1_tickets_foundation`: enums `ticket_status`, `ticket_priority`, `ticket_channel` e `ticket_event_type`; tabelas `tickets`, `ticket_events` e `ticket_protocol_counters`, todas com `FORCE ROW LEVEL SECURITY`; FKs compostas por tenant para empresa, contato e membership do responsável; `ticket_events` append-only por trigger;
- protocolo `AAAA-NNNNNN` por organização e ano (fuso America/Sao_Paulo), gerado por `INSERT … ON CONFLICT DO UPDATE … RETURNING` na transação de criação; validado com 8 aberturas concorrentes;
- permissões `ticket.read` (todos) e `ticket.write` (ADMIN, MANAGER, SELLER);
- API `/api/v1/tickets`: listar (busca por protocolo ou assunto, filtros de status, prioridade, canal, responsável e cliente), consultar, abrir, editar (`version`), `POST /:id/status` com máquina de estados, `POST /:id/comments` (público ou interno) e `GET /:id/events`;
- marcos `firstResponseAt` (primeiro comentário público ou saída de OPEN), `resolvedAt` (limpo na reabertura) e `closedAt`; status finais bloqueiam edição e comentário público;
- timeline com eventos CREATED, STATUS_CHANGED, COMMENT, ASSIGNED e UPDATED; auditoria `ticket.*`;
- contratos em `packages/contracts/src/tickets.ts` (schemas, transições e formatação de protocolo);
- web: seção **Atendimento** com lista, busca, filtro de status, abertura, detalhe com timeline, troca de status (só transições válidas) e comentário.

## Evidência de testes (local, banco limpo)

- lint, typecheck, `format:check` (exceto o `ci.yml` com CRLF preexistente);
- API: 50 suítes / 218 testes (`tickets.integration` 6 e permissões 1 novos);
- contratos: 48 (4 novos); web: 86 (4 novos); `test:repo` 6/6; build OK; E2E 5/5.

## Base para C5.2, C5.3 e C5.4

- filas: nova tabela e `tickets.queue_id` via `ALTER TABLE` na própria migration;
- SLA: políticas por prioridade, com prazos calculados a partir de `openedAt`, `firstResponseAt` e `resolvedAt`;
- satisfação: pesquisa disparada ao entrar em `RESOLVED`.

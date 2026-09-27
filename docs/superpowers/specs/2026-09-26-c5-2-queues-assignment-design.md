# C5.2 — Filas de atendimento e atribuição — Design

## Contexto

A C5.1 entregou a fundação de Atendimento (solicitações com protocolo, status, prioridade, canal, cliente, responsável e linha do tempo) na branch `phase-3-atendimento`. A C5.2 organiza o trabalho em **filas** e facilita a **atribuição**: assumir uma solicitação, ver "minhas solicitações" e, opcionalmente, distribuir automaticamente as novas solicitações de uma fila entre os membros que atendem. Design geral da fase: `docs/superpowers/specs/2026-09-26-fase-3-atendimento-design.md`.

## Objetivo

1. Cadastrar filas de atendimento por organização.
2. Classificar solicitações por fila, com histórico da troca na linha do tempo.
3. Permitir que o atendente assuma uma solicitação e filtre as suas.
4. Distribuir automaticamente as solicitações abertas numa fila configurada para isso.

## Escopo

### Modelo (migration `20260926130000_c5_2_support_queues`)

- tabela `support_queues` (tenant, `FORCE ROW LEVEL SECURITY` com `app.current_organization_id`): `name` (até 120), `description`, `isActive`, `autoAssign`, `version`, autoria (`createdBy`/`updatedBy`) e exclusão lógica (`deletedAt`/`deletedBy`);
- `name` é único por organização entre filas não excluídas, sem diferenciar caixa (índice único parcial em `(organization_id, lower(name)) WHERE deleted_at IS NULL`); depois da exclusão lógica o nome fica livre;
- `tickets.queue_id` opcional, adicionado por `ALTER TABLE`, com FK composta `(queue_id, organization_id) → support_queues(id, organization_id)` e índice `(organization_id, queue_id, deleted_at, status)`.

### Solicitações "abertas"

`TICKET_OPEN_STATUSES = OPEN, IN_PROGRESS, WAITING_CUSTOMER` (em `packages/contracts`). É a carga de trabalho: conta para a distribuição automática, para o contador `openTicketCount` da fila e para o bloqueio da exclusão. Solicitações `RESOLVED`, `CLOSED` e `CANCELLED` mantêm o `queueId` como histórico, mesmo se a fila for excluída depois.

### Permissões

- nova `support.manage` (ADMIN e MANAGER): criar, editar e excluir filas;
- `ticket.read` (todos os perfis): listar e consultar filas;
- `ticket.write`: informar fila ao abrir/editar e usar `assign-to-me`.

### API (`/api/v1`)

- `GET /support-queues?active=true|false|all`: lista ordenada por nome, com `openTicketCount`;
- `GET /support-queues/:id`;
- `POST /support-queues { name, description?, isActive?, autoAssign? }` → 201;
- `PATCH /support-queues/:id { …, version }` → 200; 409 `SUPPORT_QUEUE_VERSION_CONFLICT` com versão velha;
- `DELETE /support-queues/:id` → 204; 409 `SUPPORT_QUEUE_HAS_OPEN_TICKETS` se houver solicitações abertas na fila. A exclusão trava a fila (`FOR UPDATE`) e a validação da fila na abertura/edição da solicitação usa `FOR SHARE`, o que impede que uma abertura concorrente escape do bloqueio;
- nome duplicado (ignorando caixa) → 409 `SUPPORT_QUEUE_NAME_CONFLICT` (inclusive na corrida, pela violação do índice único);
- `POST /tickets` e `PATCH /tickets/:id` aceitam `queueId` (UUID; `null` no PATCH remove). A fila precisa ser do tenant e não excluída (404 `SUPPORT_QUEUE_NOT_FOUND`) e estar ativa (400 `SUPPORT_QUEUE_INACTIVE`). A validação só roda quando a fila muda;
- `GET /tickets` ganha `queueId` e `assigneeUserId=me` (resolvido para o usuário autenticado);
- `POST /tickets/:id/assign-to-me { version }` (`ticket.write`) → 200 com a solicitação: atribui ao usuário autenticado, incrementa `version`, grava evento `ASSIGNED` (`metadata.selfAssigned = true`) e audita `ticket.assigned_to_me`. É idempotente quando o usuário já é o responsável (responde a solicitação sem mudar `version`, mas confere a versão). Solicitação em status final → 400 `TICKET_FINAL`; versão velha → 409.

### Linha do tempo

- troca de fila: evento `UPDATED` com `metadata { fields: ["queueId"], fromQueueId, toQueueId }` — sem tipo novo no enum, para não exigir migration de enum nem conflitar com C5.3/C5.4. Outras alterações do mesmo PATCH seguem num `UPDATED` separado com `metadata.fields`;
- abertura com fila: `CREATED` com `metadata { queueId }`;
- atribuição automática: `ASSIGNED` com `metadata { fromAssigneeUserId: null, toAssigneeUserId, autoAssigned: true, queueId }`.

### Distribuição automática (`autoAssign`)

Na **abertura** de uma solicitação **sem responsável informado** numa fila com `autoAssign = true`:

1. candidatos: memberships ativas da organização, de usuários ativos, cujo perfil tem `ticket.write` (hoje ADMIN, MANAGER e SELLER, derivados do mapa de permissões);
2. escolhe o candidato com **menos solicitações abertas naquela fila**;
3. **desempate:** a membership mais antiga na organização (`organization_memberships.created_at` crescente) e, por fim, o menor `user_id`. Na prática, com carga igual o rodízio segue a ordem de entrada dos membros;
4. um lock consultivo por fila (`pg_advisory_xact_lock`) serializa aberturas concorrentes na mesma fila, para que cada contagem já considere a atribuição anterior;
5. sem candidatos, a solicitação fica sem responsável.

Responsável informado explicitamente prevalece. A troca de fila numa edição **não** redistribui (fora do escopo).

### Auditoria

`support_queue.created`, `support_queue.updated`, `support_queue.deleted` (entityType `support_queue`, com `before`/`after`), `ticket.assigned_to_me`; `ticket.created`/`ticket.updated` passam a incluir `queueId` nos snapshots.

### Contratos (`packages/contracts`)

`support-queues.ts` (schemas de criação, edição e listagem e o tipo `SupportQueue`); em `tickets.ts`: `queueId` em criação/edição/listagem, `assigneeUserId` aceitando `me`, `TicketAssignToMeInputSchema` e `TICKET_OPEN_STATUSES`.

### Web (seção Atendimento)

- botão **Gerenciar filas** (com `support.manage`): tabela de filas (situação, distribuição, abertas), criação, edição e exclusão com confirmação (desabilitada quando há solicitações abertas);
- filtro **Fila** e atalho **Minhas solicitações** (`assigneeUserId=me`) na lista; coluna Fila;
- seleção de fila (só ativas) na abertura;
- no detalhe: fila e responsável, botão **Assumir** (com `ticket.write`, quando não é o responsável e a solicitação não está em status final) e descrição de troca de fila e atribuição automática na linha do tempo.

## Fora do escopo

- membros por fila (a distribuição considera todos os membros elegíveis da organização);
- redistribuição ao trocar de fila, ao desativar membro ou por capacidade/horário;
- SLA por fila (C5.3) e roteamento por canal/assunto (automações — Fase 5);
- listagem de usuários com nome no detalhe da solicitação (a tela mostra "Você", "Outro membro" ou "Sem responsável").

## Critérios de aceite

1. ADMIN e MANAGER fazem CRUD de filas; SELLER e VIEWER recebem 403 nas mutações e listam com 200.
2. Nome duplicado ignorando caixa no mesmo tenant → 409; o mesmo nome em outro tenant e após exclusão lógica é aceito.
3. Exclusão com solicitações abertas → 409; após resolver, 204.
4. Outro tenant não lê, edita nem exclui filas alheias (404) e a RLS não vaza linhas; FK composta impede solicitação apontando para fila de outro tenant.
5. Fila inativa → 400; de outro tenant ou excluída → 404.
6. `assign-to-me` atribui, grava evento e auditoria, é idempotente e respeita `version` e status final; `assigneeUserId=me` filtra pelo usuário autenticado.
7. Auto-assign segue carga na fila e o desempate documentado, ignora inelegíveis (VIEWER, inativos), respeita responsável explícito e distribui de forma equilibrada sob concorrência.

# Fase 3 — Atendimento — Design geral e C5.1 Fundação de solicitações

## Contexto

A Fase 2 — Produtividade está candidata a fechamento (`docs/releases/produtividade-phase-2-2026-09-25.md`), aguardando o gate do CI e a aprovação humana do PR `develop → main`. Por decisão do responsável do produto (26/09/2026), a Fase 3 começa **em paralelo, na branch `phase-3-atendimento`**, e só entra na `develop` depois do fechamento oficial da Fase 2.

Roadmap da Fase 3: **solicitações, protocolos, filas, SLA e satisfação**.

## Microentregas

| ID   | Entrega                                                                                      | Depende de |
| ---- | -------------------------------------------------------------------------------------------- | ---------- |
| C5.1 | Solicitações com protocolo, status, prioridade, canal, cliente, responsável e linha do tempo | —          |
| C5.2 | Filas de atendimento e atribuição                                                            | C5.1       |
| C5.3 | SLA por prioridade: prazos, estouro e indicador                                              | C5.1       |
| C5.4 | Pesquisa de satisfação (CSAT) ao resolver                                                    | C5.1       |

C5.2, C5.3 e C5.4 são desenvolvidas em paralelo sobre a C5.1. Cada uma cria **suas próprias tabelas e migration**. Colunas novas em `tickets` só entram por `ALTER TABLE` na migration da própria entrega.

## C5.1 — Fundação

### Modelo

- `tickets` (tenant, RLS FORCE, exclusão lógica, `version`):
  - `protocol` no formato `AAAA-NNNNNN` (ano de abertura + sequência de 6 dígitos por organização e ano), único por organização;
  - `subject` (até 200), `description` (texto);
  - `status`: `OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED`, `CANCELLED`;
  - `priority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`;
  - `channel`: `PHONE`, `EMAIL`, `WHATSAPP`, `WEB`, `IN_PERSON`, `OTHER`;
  - cliente opcional: `companyId` e/ou `contactId` (FKs compostas por tenant);
  - `assigneeUserId` opcional (FK para membership ativa da organização);
  - marcos: `openedAt`, `firstResponseAt`, `resolvedAt`, `closedAt`.
- `ticket_events` (tenant, RLS FORCE, append-only): `type` (`CREATED`, `COMMENT`, `STATUS_CHANGED`, `ASSIGNED`, `UPDATED`), `body`, `isInternal`, `fromStatus`/`toStatus`, `authorUserId` e `createdAt`.
- `ticket_protocol_counters` (tenant, RLS FORCE): `(organization_id, year) → last_value`, incrementado atomicamente (`INSERT … ON CONFLICT DO UPDATE … RETURNING`) na transação de criação.

### Regras

- Transições de status permitidas:
  - `OPEN → IN_PROGRESS | WAITING_CUSTOMER | RESOLVED | CANCELLED`;
  - `IN_PROGRESS → WAITING_CUSTOMER | RESOLVED | CANCELLED`;
  - `WAITING_CUSTOMER → IN_PROGRESS | RESOLVED | CANCELLED`;
  - `RESOLVED → CLOSED | IN_PROGRESS` (reabertura);
  - `CLOSED` e `CANCELLED` são finais.
  - Uma transição inválida responde 400 `TICKET_INVALID_TRANSITION`.
- `resolvedAt` é gravado ao entrar em `RESOLVED` e limpo na reabertura; `closedAt` é gravado ao entrar em `CLOSED`.
- `firstResponseAt` é o primeiro comentário **público** feito por um usuário da organização, ou a primeira saída de `OPEN`, o que vier antes.
- Toda mutação usa `version` (409 em conflito), gera um evento na timeline na mesma transação e é auditada (`ticket.*`).
- Solicitação em status final não aceita edição de campos (400), só comentário interno.

### Permissões

- `ticket.read`: todos os perfis.
- `ticket.write`: ADMIN, MANAGER e SELLER.

### API (`/api/v1`)

- `GET /tickets`: paginação, busca por protocolo ou assunto e filtros de `status`, `priority`, `channel`, `assigneeUserId`, `companyId` e `contactId`;
- `GET /tickets/:id`;
- `POST /tickets`;
- `PATCH /tickets/:id`: assunto, descrição, prioridade, canal, cliente e responsável, com `version`;
- `POST /tickets/:id/status { status, note?, version }`;
- `POST /tickets/:id/comments { body, isInternal, version }`: incrementa `version`;
- `GET /tickets/:id/events`.

### Web

Seção **Atendimento** (com `ticket.read`): lista com busca e filtro de status, abertura de solicitação, detalhe com timeline, troca de status e comentário público ou interno (com `ticket.write`).

## Fora do escopo da Fase 3

Portal do cliente com login, e-mail/WhatsApp de entrada (Fase 4 — Integrações), automações (Fase 5), base de conhecimento e calendário de horário comercial para o SLA.

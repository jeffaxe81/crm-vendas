# Checkpoint — C5.3 SLA de atendimento por prioridade

Data: 26/09/2026
Branch: `feat/c5-3-sla` (a partir de `phase-3-atendimento`)
Design: `docs/superpowers/specs/2026-09-26-c5-3-sla-design.md`
Status: implementada e validada localmente pelo gate completo; aguardando integração à `phase-3-atendimento`.

## Construído

- migration `20260926140000_c5_3_sla`: tabela `sla_policies` (RLS FORCE, única por `(organization_id, priority)`, checks de minutos positivos e resolução ≥ primeira resposta, FKs de organização e autores) e colunas `tickets.first_response_due_at` / `tickets.resolution_due_at` por `ALTER TABLE`;
- `schema.prisma`: model `SlaPolicy` no fim do arquivo; campos/relações novos no fim de `Organization`, `User` e `Ticket`; client regenerado;
- permissão `support.manage` (ADMIN e MANAGER) em `permissions.ts`;
- módulo `apps/api/src/sla/`: `SlaPoliciesService`/`SlaPoliciesController` (`GET /api/v1/sla-policies` com `ticket.read`; `PUT /api/v1/sla-policies/:priority` com `support.manage`, 201 ao criar, 200 ao editar com `version`, 409 `SLA_POLICY_VERSION_CONFLICT`, auditoria `sla_policy.created`/`sla_policy.updated`), `resolveSlaDeadlines` (política ativa → prazos, dentro da transação do chamador) e o token `SLA_CLOCK`;
- `TicketsService` (mudança mínima): prazos gravados no `create` e recalculados no `update` somente quando a prioridade muda (sempre a partir de `openedAt`), na mesma transação; todas as respostas de solicitação trazem `sla: { firstResponse, resolution }` calculado com o relógio injetável; auditoria `ticket.*` passa a incluir os prazos;
- relatório `GET /api/v1/reports/sla?from&to` (`reports.read`) em `apps/api/src/reports/sla.service.ts`: SQL agregado em `withTenant`, por prioridade (as 4, de `URGENT` a `LOW`) e total: abertas no período, % de 1ª resposta e % de resolução no prazo (base = prazos com resultado conhecido), vencidas em aberto agora (independe do período);
- contratos `packages/contracts/src/sla.ts`: schemas de política, upsert, estado, relatório e as funções puras `computeSlaState`, `computeTicketSla` e `slaDueAt`;
- web: botão/painel **Políticas de SLA** na seção Atendimento (só `support.manage`), coluna **SLA** com selo do estado mais grave na lista, prazos e selos no detalhe, aba **SLA** no Resumo gerencial com filtros e total geral; estilos `.sla-badge*` no fim de `globals.css`.

## Evidência de testes (local, PostgreSQL, banco limpo)

- `prettier --check`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente); `lint` e `typecheck`: OK;
- API: 53 suítes / 227 testes (antes 50/218). Novos:
  - `sla/sla.integration` (4): upsert com `version`, 409 sem/velho `version` e em criação com `version`, 400 de validação, SELLER/VIEWER 403 e VIEWER lendo, auditoria; isolamento de políticas entre tenants (mesma prioridade, prazos da própria política); prazos na abertura, nulos sem política ou com política inativa, recálculo ao mudar a prioridade relativo a `openedAt` (com relógio avançado), outro campo não recalcula; estados `OK`/`AT_RISK`/`BREACHED` via `GET` e listagem, `MET` no limite exato/`MISSED`, reabertura mantendo o prazo (`BREACHED`);
  - `database/sla-rls.integration` (2): sem contexto não enxerga nada, tenant só vê a própria política, não altera nem cria política de outro tenant, checks e unicidade no banco;
  - `reports/sla-report.integration` (2): contagens/taxas por prioridade com período, cancelada fora da resolução, sem política com taxas `null`, excluída ignorada, vencidas em aberto fora do período contadas, outro tenant não vaza, sem período; SELLER 403, 401, período invertido e parâmetro desconhecido 400, relatório vazio;
  - `authorization/permissions.spec` (+1): `support.manage` só ADMIN/MANAGER;
- contratos: 56 testes (8 novos: bordas de 20%, prazo exato, `MET` no limite, `MISSED`, sem prazo, cancelada, `slaDueAt`, validações de upsert e do relatório);
- web: 92 testes (6 novos: helpers de estado/minutos; selos na lista e no detalhe sem `support.manage`; painel de políticas com edição com `version`, validação local e criação sem `version`; rota do relatório; tabela com destaque e filtros; aba SLA no Resumo gerencial);
- `test:repo` 6/6; `pnpm build` OK.

## Decisões preservadas / fora do escopo

- minutos corridos 24x7; horário comercial, feriados e pausa em `WAITING_CUSTOMER` fora do escopo (documentado no design);
- estado do SLA derivado a cada resposta, nunca persistido; alterar/desativar política não recalcula solicitações existentes;
- no instante exato do prazo, pendente = `AT_RISK` (vencido só depois); cumprido no instante exato = `MET`;
- `PUT` por prioridade como upsert (sem `DELETE`: desativar cobre o caso);
- `breachedOpen` no relatório é a foto de agora, independente do período (o rótulo na tela diz "Vencidas em aberto agora");
- o painel de políticas carrega só ao ser aberto, para não mudar a sequência de requisições da tela de solicitações.

## Pontos de atenção para o merge

- `permissions.ts`: C5.2/C5.4 podem criar `support.manage` em paralelo — manter uma única entrada na lista e em ADMIN/MANAGER;
- `schema.prisma` (fim de `Organization`, `User`, `Ticket` e do arquivo), `tickets.service.ts` (construtor com `SLA_CLOCK`, `create`, `update`, retornos com `withSla`), `tickets.module.ts` (provider do relógio), `app.module.ts`, `reports.controller.ts`/`reports.module.ts` (acréscimos no fim), `packages/contracts/src/index.ts`, `management-summary-view.tsx` (aba SLA), `tickets-view.tsx` (cabeçalho, painel e coluna SLA), `ticket-detail.tsx`, `ticket-labels.ts` e o fim de `globals.css` podem conflitar com as outras entregas da fase; os conflitos são de acréscimo;
- o client Prisma gerado (`apps/api/src/generated`) precisa ser regenerado após o merge dos schemas.

## Próximo passo

Integrar à `phase-3-atendimento` junto com C5.2 e C5.4; em seguida avaliar SLA por fila (C5.2) e alertas de risco/estouro na fase de automações.

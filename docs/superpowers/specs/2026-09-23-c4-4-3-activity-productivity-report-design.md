# C4.4.3 — Relatório de atividades por responsável (produtividade comercial) — Design

## Contexto

As atividades (`activities`, C2) têm `type` (`TASK`, `APPOINTMENT`), `status` (`PENDING`, `COMPLETED`, `CANCELLED`), `ownerUserId`, `dueAt`, `completedAt` e exclusão lógica. O resumo gerencial (C4.1.1) já mostra contagens globais de pendentes/atrasadas, mas o gestor ainda não enxerga **quem** está entregando e **quem** está acumulando atraso. Esta entrega acrescenta ao bloco de Relatórios um recorte de produtividade por responsável, reutilizando o módulo `apps/api/src/reports` (permissão `reports.read`) e o padrão da C4.4 (SQL agregado parametrizado dentro de `withTenant`).

## Objetivo

1. Consolidar, por responsável, o volume de atividades e a situação delas (concluídas, pendentes, canceladas, atrasadas, concluídas no prazo) e a taxa de conclusão.
2. Mostrar a distribuição por tipo (tarefa × compromisso).
3. Permitir recorte por período do prazo e por tipo.

## Escopo

### API

- `GET /api/v1/reports/activities-by-owner`, protegido por `reports.read` (ADMIN e MANAGER; SELLER e VIEWER recebem 403);
- parâmetros opcionais (contrato `ActivitiesByOwnerQuerySchema`, estrito):
  - `from` e `to`: data-hora ISO com fuso, aplicadas a `activities.dueAt` com limites **inclusivos** (`>=`/`<=`). Com qualquer um deles informado, **atividades sem `dueAt` ficam de fora** (não têm prazo para cair no período);
  - `type`: `TASK` ou `APPOINTMENT`;
  - `from > to`, data ou tipo inválidos e qualquer outro parâmetro (inclusive `organizationId` e `ownerUserId`) dão 400 `VALIDATION_ERROR`;
- base do cálculo: atividades **não excluídas** do tenant, cujo responsável tem `organization_memberships` na organização (membership ativa ou desativada; o desligamento não apaga o histórico). Responsáveis sem membership na organização ficam de fora;
- por responsável (`ownerUserId`, `ownerDisplayName` = `users.displayName`, `ownerActive` = membership e usuário ativos):
  - `total`, `completed` (`COMPLETED`), `pending` (`PENDING`), `cancelled` (`CANCELLED`) — `total = completed + pending + cancelled`;
  - `overdue`: `PENDING` com `dueAt < agora` (estrito: vencendo exatamente agora ainda não está atrasada, mesma regra do resumo gerencial). Canceladas não contam como atrasadas, e concluídas também não;
  - `completedOnTime`: `COMPLETED` com `completedAt` e `dueAt` preenchidos e `completedAt <= dueAt`;
  - `completionRate`: `completed / total` (número entre 0 e 1) ou `null` quando `total = 0`;
  - `byType`: `{ TASK, APPOINTMENT }`;
- `totals` com as mesmas métricas somadas sobre os responsáveis listados;
- ordenação: concluídas desc, total desc, nome de exibição (pt-BR) e id (determinística);
- resposta traz `asOf` (o "agora" usado nas atrasadas) e o eco dos `filters` normalizados (datas em UTC ou `null`).

### Implementação

- `ActivitiesByOwnerService` (`apps/api/src/reports/activities-by-owner.service.ts`) executa uma consulta SQL agregada (`$queryRaw` com `Prisma.sql`, `COUNT(*) FILTER (...)`) dentro de `prisma.withTenant`; além do RLS, o `WHERE` filtra `a.organization_id` explicitamente e a junção com `organization_memberships` usa `organization_id` + `user_id`;
- o relógio é injetável: token `ACTIVITIES_BY_OWNER_CLOCK` (`() => Date`), registrado no `ReportsModule` com o relógio do servidor; os testes sobrescrevem o provider para fixar "agora";
- o controller recebe o serviço por injeção de propriedade e a validação da query fica em `parseActivitiesByOwnerQuery` no arquivo do serviço — acréscimos mínimos e no fim de `reports.controller.ts`/`reports.module.ts` para reduzir conflitos com outras entregas de relatórios;
- a resposta é validada com `ActivitiesByOwnerReportSchema` antes de sair; erro de banco vira 5xx, nunca zeros silenciosos.

### Contratos

`packages/contracts/src/activities-by-owner.ts`: `ActivitiesByOwnerQuerySchema`, `ActivitiesByOwnerCountsSchema`, `ActivitiesByOwnerRowSchema`, `ActivitiesByOwnerReportSchema` e tipos, exportados no `index`.

### Web

- nova aba **Atividades** no **Resumo gerencial** (`activities-by-owner-view.tsx`), com filtros `De`/`Até` (convertidos para início/fim do dia no fuso local, como em Vendas por produto) e `Tipo` (Todos/Tarefa/Compromisso), validação de período invertido, botão **Limpar**;
- tabela por responsável: total, concluídas, pendentes, atrasadas, no prazo, taxa de conclusão e tarefas/compromissos, com linha **Total geral**; responsáveis com membership desativada aparecem com "(inativo)";
- destaque visual para atrasadas: linha com borda de alerta e contagem em vermelho com o selo "atrasadas" quando `overdue > 0`.

## Fora do escopo

- alteração de schema ou nova permissão;
- filtro por responsável, prioridade ou vínculo (empresa/contato/oportunidade);
- metas por vendedor, séries temporais, gráficos e exportação CSV/PDF;
- tempo médio de conclusão.

## Critérios de aceite

1. Contagens por status, atrasadas com relógio fixo (incluindo limite `dueAt = agora`), concluídas no prazo (incluindo `completedAt = dueAt`) e taxa de conclusão corretas; exclusões lógicas ignoradas.
2. Filtros de período (inclusivos, com fuso, excluindo atividades sem prazo) e de tipo, isolados e combinados.
3. Isolamento entre tenants, inclusive para um usuário membro das duas organizações; só responsáveis com membership aparecem.
4. RBAC: ADMIN e MANAGER 200; SELLER e VIEWER 403; sem sessão 401; parâmetros inválidos 400.
5. Web: aba acessível, filtros enviados na URL, destaque de atrasadas, estados vazio e de erro.

# Checkpoint — C4.4.2 Relatório de funil e conversão

Data: 25/09/2026
Branch: `feat/c4-4-2-funnel-conversion-report`
Design: `docs/superpowers/specs/2026-09-23-c4-4-2-funnel-conversion-report-design.md`
Status: implementada e validada localmente pelo gate completo; aguardando integração à `develop`.

## Construído

- contrato `packages/contracts/src/funnel.ts` (exportado no fim do `index`): `FunnelQuerySchema` (estrito, `pipelineId` obrigatório, `from`/`to` ISO com fuso e `from <= to`, `ownerUserId` UUID), `FunnelReportSchema` com `asOf`, `filters`, `pipeline`, `stages`, `inactiveStages`, `totals` e `indicators`; `FunnelPercentSchema` (taxa como string 0–100 com 2 casas) e demais esquemas/tipos;
- API `GET /api/v1/reports/funnel` (`reports.read`) com `FunnelService` (`apps/api/src/reports/funnel.service.ts`):
  - funil buscado por `organizationId` + `id` dentro de `withTenant` (RLS + filtro explícito); outro tenant ou inexistente → 404 `PIPELINE_NOT_FOUND`; funil inativo do próprio tenant continua consultável;
  - etapas ativas em ordem de `position`, inclusive as vazias (zeradas);
  - uma agregação SQL parametrizada (`Prisma.sql`) por etapa com `COUNT(*)` e `SUM(estimated_value)`, junção composta por `organization_id`/`pipeline_id`, só oportunidades não excluídas, em `RepeatableRead`;
  - oportunidades em etapas desativadas ficam em `inactiveStages` e entram em `totals` e indicadores;
  - indicadores: quantidades e valores em aberto/ganho/perdido, `winRate` = ganhas/(ganhas+perdidas) em % com 2 casas e `averageWonTicket`, ambos com arredondamento meio para cima em `bigint` e `null` em divisão por zero;
  - período aplicado a `createdAt` (coorte de entrada no funil; justificativa no spec), limites inclusivos; filtro `ownerUserId` combinável;
- controller e módulo: apenas acréscimos (import, injeção no fim do construtor, rota `funnel` no fim da classe, `FunnelService` no fim de `providers`/`exports`);
- web: aba **Funil** no Resumo gerencial (`apps/web/src/app/reports/funnel-view.tsx`; na `management-summary-view.tsx` só o item no fim de `reportTabs`, o tipo e um ramo do painel), com seletor de funil carregado de `GET /pipelines`, filtro `De`/`Até`, cartões de indicadores ("—" para `null`), tabela por etapa com barra proporcional em CSS (classes `funnel-report__bar*` acrescentadas no fim de `globals.css`), linha Total e aviso de etapas desativadas.

## Evidência de testes (local, PostgreSQL, banco limpo)

- `prettier --check`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente); `lint`, `typecheck`: OK;
- API: 46 suítes / 195 testes (novos: `funnel.integration` 6 — agregação por etapa em ordem de `position` com etapa desativada e oportunidade excluída, totais e indicadores (66,67% e ticket 2.250,25); filtros de período sobre `createdAt` com limite inclusivo e fuso, responsável e combinados; divisão por zero (período vazio → `null`, só perdidas → `0.00`/ticket `null`) e arredondamento meio para cima (33,33% e 333,34); isolamento com funil de outro tenant e inexistente → 404, funil inativo consultável e soma exata de valores grandes; RBAC ADMIN=MANAGER, 403 SELLER/VIEWER, 401, 400 para `pipelineId` ausente/inválido, parâmetro desconhecido, datas inválidas e período invertido; 5xx em falha de banco);
- contratos: 38 (4 novos); web: 71 (6 novos em `funnel-view.test.tsx`, inclusive a navegação pela aba **Funil**);
- `test:repo` 6/6; `pnpm build` OK.

## Decisões preservadas / fora do escopo

- schema do banco inalterado; nenhuma permissão nova (reutiliza `reports.read`; o seletor usa `GET /pipelines`, que exige `opportunity.read`, presente em ADMIN e MANAGER);
- taxa de ganho é de coorte (situação atual das oportunidades criadas no período), pois não há data de ganho/perda nem histórico de movimentação;
- sem conversão etapa a etapa, tempo por etapa, seletor de responsável na UI (a API aceita `ownerUserId`) e exportação.

## Próximo passo

Integrar à `develop`. Pontos de merge: `reports.controller.ts`, `reports.module.ts`, `packages/contracts/src/index.ts`, `management-summary-view.tsx` e `globals.css` só receberam acréscimos no fim, mas a linha única de `providers`/`exports` do módulo pode conflitar com outras entregas (resolver mantendo todos os serviços). Depois: seletor de responsável, histórico de etapas para conversão entre etapas.

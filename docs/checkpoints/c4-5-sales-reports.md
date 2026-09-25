# Checkpoint — C4.5 Vendas por vendedor, filtros e exportação CSV

Data: 25/09/2026
Branch: `feat/c4-5-sales-reports`
Status: implementada e validada localmente; aguardando revisão e integração à `develop`.

## Construído

- contrato `packages/contracts/src/sales-by-owner.ts`: `SalesByOwnerQuerySchema` (estrito, `from`/`to` ISO com fuso e `from <= to`, `pipelineId` UUID; sem `ownerUserId`), `SalesByOwnerReportSchema` com `asOf`, `filters`, `items`, `totals` e `winRate` (`ReportPercentSchema`, 1 casa, `null` sem fechamentos);
- contrato `packages/contracts/src/report-csv.ts`: `salesByProductToCsv` e `salesByOwnerToCsv` no padrão do Excel pt-BR (`;`, decimal com vírgula, CRLF, BOM UTF-8), com escape de aspas/separadores e neutralização de fórmulas (CSV injection);
- API `GET /api/v1/reports/sales-by-owner` (`reports.read`) com `SalesByOwnerService`:
  - uma agregação SQL parametrizada dentro de `prisma.withTenant` em `RepeatableRead`, por responsável × situação da etapa;
  - valor = `estimated_value` da oportunidade, cada oportunidade contada uma vez; só oportunidades não excluídas;
  - responsável resolvido via `organization_memberships` do tenant + `users`; associações ou usuários inativos continuam no histórico, sinalizados por `ownerActive`;
  - somas em centavos com `bigint`, sem ponto flutuante; taxa de conversão = ganhas ÷ (ganhas + perdidas) por quantidade, arredondada meio para cima;
  - ordenação por valor ganho desc, valor em aberto desc, nome e id;
- web:
  - `report-filters.tsx`: formulário compartilhado (De, Até, Funil, Vendedor), montagem de URL, carga das opções (`/pipelines` e vendedores do próprio relatório por vendedor) tolerante a falhas e download de CSV;
  - aba **Vendas por produto**: seletores de funil e vendedor (a API já aceitava `pipelineId`/`ownerUserId`) e botão **Exportar CSV**;
  - nova aba **Vendas por vendedor** no Resumo gerencial, com filtros de período e funil, coluna **Conversão**, linha **Total geral** e **Exportar CSV**.

## Evidência de testes (local, PostgreSQL 16, banco limpo)

- `lint`, `typecheck`: OK; `prettier --check`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente);
- API: 47 suítes / 198 testes (novos: `sales-by-owner.integration` 7 — relatório vazio, agregação por situação ignorando excluída, filtros de período inclusivo com fuso e funil, histórico de vendedor inativo, isolamento entre tenants com soma exata de valores grandes, RBAC ADMIN=MANAGER, 403 SELLER/VIEWER, 401 e 400, 5xx em falha de banco; `sales-by-owner.service.spec` 2 — arredondamento da conversão);
- contratos: 42 (8 novos); web: 74 (9 novos: 3 na aba de produto, 5 na aba de vendedor, 1 de navegação);
- `pnpm build` OK;
- `test:repo`: não executável neste ambiente (exige `docker compose config`); sem alteração em arquivos cobertos por ele.

## Decisões preservadas / fora do escopo

- schema do banco inalterado; nenhuma permissão nova (reutiliza `reports.read`; a lista de funis usa `opportunity.read`, que ADMIN e MANAGER já têm);
- exportação gerada no navegador a partir do relatório já filtrado, sem endpoint novo: o arquivo reflete exatamente o que está na tela;
- as opções de vendedor vêm do relatório por vendedor (quem tem oportunidades), evitando depender de `/admin/users` (`user.manage`);
- sem PDF, gráficos, metas e comissões.

## Próximo passo

Revisar o PR, integrar à `develop` e seguir o bloco de Relatórios (por exemplo, relatório por período/mês ou gráficos no Resumo gerencial).

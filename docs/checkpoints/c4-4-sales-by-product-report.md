# Checkpoint — C4.4 Relatório de vendas por produto

Data: 23/09/2026
Branch: `feat/c4-4-sales-by-product-report`
Design: `docs/superpowers/specs/2026-09-23-c4-4-sales-by-product-report-design.md`
Status: implementada e validada localmente pelo gate completo; aguardando integração à `develop`.

## Construído

- contrato `packages/contracts/src/sales-by-product.ts` (exportado no `index`): `SalesByProductQuerySchema` (estrito, `from`/`to` ISO com fuso e `from <= to`, `pipelineId`/`ownerUserId` UUID), `SalesByProductReportSchema` com `asOf`, `filters`, `items` e `totals`, e os esquemas de valor (`ReportMoneySchema`, 2 casas) e quantidade (`ReportQuantitySchema`, 3 casas);
- API `GET /api/v1/reports/sales-by-product` (`reports.read`) no módulo de relatórios existente, com `SalesByProductService`:
  - duas agregações SQL parametrizadas (`Prisma.sql`) dentro de `prisma.withTenant` em `RepeatableRead`: por produto × situação da etapa e por situação para os totais gerais;
  - junções compostas por `organization_id` e filtro explícito por tenant somados ao RLS;
  - só oportunidades não excluídas; produtos inativos/excluídos com itens históricos aparecem sinalizados (`productActive`, `productDeleted`);
  - `opportunities` conta oportunidades distintas; `total` = aberto + ganho + perdido;
  - somas em `numeric` no banco e composição/formatação em `bigint` de escala fixa, sem ponto flutuante;
  - ordenação por valor ganho desc, valor em aberto desc, nome e id;
  - filtros `from`/`to` inclusivos sobre `expectedCloseAt` (como a listagem de oportunidades), `pipelineId` e `ownerUserId`, combináveis;
- web: a tela **Resumo gerencial** ganhou abas **Indicadores** (conteúdo anterior) e **Vendas por produto** (`sales-by-product-view.tsx`), com filtro de período `De`/`Até`, validação de período invertido, tabela por situação e linha **Total geral**. A visibilidade segue `reports.read`, a mesma do Resumo gerencial.

## Evidência de testes (local, PostgreSQL, banco limpo)

- `prettier --check`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente); `lint`, `typecheck`: OK;
- API: 42 suítes / 164 testes (novos: `sales-by-product.integration` 6 — relatório vazio, agregação por situação com oportunidade excluída e produto excluído, filtros de período/limite inclusivo com fuso/funil/responsável/combinados, isolamento entre tenants com filtro por funil de outro tenant e soma exata de valores grandes, RBAC ADMIN=MANAGER, 403 para SELLER e VIEWER, 401 e 400 para parâmetros inválidos, 5xx em falha de banco);
- contratos: 34 (4 novos); web: 55 (5 novos: 4 da view e 1 de navegação pela aba);
- `test:repo` 6/6; `pnpm build` OK.

## Decisões preservadas / fora do escopo

- schema do banco inalterado; nenhuma permissão nova (reutiliza `reports.read`);
- sem exportação CSV/PDF, gráficos, metas e comissões;
- a UI expõe só o filtro de período; `pipelineId` e `ownerUserId` já funcionam na API e podem ganhar seletores depois;
- com `from` ou `to` informado, oportunidades sem previsão de fechamento ficam de fora (mesma regra da listagem).

## Próximo passo

Integrar à `develop` e seguir o bloco de Relatórios (por exemplo, filtros de funil/responsável na UI, exportação CSV e relatório por vendedor).

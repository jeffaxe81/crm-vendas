# Checkpoint — C4.3 Produtos e C4.3.1 Itens de oportunidade

Data: 23/09/2026
Branch: `feat/c4-3-products-opportunity-items`
Design: `docs/superpowers/specs/2026-09-23-c4-3-products-design.md`
Status: implementada, validada localmente pelo gate completo e integrada à `develop`.

## Construído

- migration `20260923120000_c4_3_products_opportunity_items`: tabelas `products` e `opportunity_items` com `FORCE ROW LEVEL SECURITY`, FKs compostas por tenant, `CHECK`s (preço ≥ 0, quantidade > 0, desconto 0–100, total ≥ 0) e índice único parcial `lower(code)` por tenant entre não excluídos;
- permissões `product.read` (todos os perfis) e `product.write` (ADMIN, MANAGER);
- API `/api/v1/products`: listar (busca, `active`, ordenação), consultar, criar, editar com `version`, excluir logicamente, com auditoria `product.*`; código duplicado dá 409 (pré-checagem mais índice único);
- API `/api/v1/opportunities/:id/items`: listar, adicionar, alterar e remover. Cada mutação recalcula `estimatedValue = Σ lineTotal` e incrementa `version` na mesma transação, com `version` como trava otimista (409 desfaz o item); auditoria `opportunity.item_*` com valor e versão antes/depois;
- cálculo do total da linha em aritmética inteira (`calculateLineTotalCents`, half-up) compartilhado em `@axes/contracts`; valores acima de DECIMAL(19,2) dão 400 `OPPORTUNITY_VALUE_TOO_LARGE`;
- `PATCH /opportunities/:id` com `estimatedValue` em oportunidade com itens dá 400 `OPPORTUNITY_VALUE_DERIVED`; sem itens, o valor volta a ser manual (0,00 após remover o último);
- web: seção **Produtos** (lista, busca, criação, edição, exclusão por permissão), painel **Itens** em cada oportunidade (inclusão, remoção, total) e valor exibido em BRL.

## Evidência de testes (local, PostgreSQL 16, banco limpo)

- lint, typecheck: OK; `format:check`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente);
- API: 41 suítes / 158 testes (novos: `products.integration` 5, `opportunity-items.integration` 5, permissões 1);
- contratos: 30 (5 novos, incluindo arredondamento e limites); web: 50 (6 novos);
- `test:repo` 6/6; build OK; E2E 4/4.

## Observações técnicas

- o client Prisma versionado em `apps/api/src/generated` estava defasado em relação ao `schema.prisma` (faltavam `Role`/`RolePermission`); foi regenerado. O CI já regenera antes dos testes;
- neste ambiente o download dos engines do Prisma é bloqueado. A migration foi escrita à mão, no mesmo padrão das anteriores, e validada aplicando-a em banco existente e em banco limpo. O `prisma migrate deploy` do CI aplica o mesmo SQL;
- o índice único funcional/parcial não é representável no `schema.prisma`, o que já acontece com as políticas RLS. Um `migrate diff` futuro vai acusá-lo como diferença esperada.

## Fora do escopo (mantido)

Tabelas de preço, impostos, estoque, unidades, importação de produtos, proposta em PDF e desconto global.

## Próximo passo

Relatórios da Fase 2, começando por vendas por produto, e a edição de itens na UI (a API já suporta `PATCH`).

# C4.4 — Relatório de vendas por produto — Design

## Contexto

A C4.3 criou o catálogo de produtos (`products`) e os itens de oportunidade (`opportunity_items`), com snapshot de `description`, `quantity`, `unitPrice`, `discountPercent` e `lineTotal`. O bloco **Relatórios** da Fase 2 começa com a pergunta mais pedida depois disso: **o que está sendo vendido, o que está em negociação e o que foi perdido, por produto**. Já existe um módulo de relatórios (`apps/api/src/reports`, resumo gerencial da C4.1.1, permissão `reports.read`) e a tela `Resumo gerencial` no web; esta entrega reutiliza os dois.

## Objetivo

1. Consolidar, por produto, a quantidade, o número de oportunidades e o valor (`Σ lineTotal`) dos itens das oportunidades do tenant.
2. Separar cada consolidado pela situação da etapa da oportunidade (`pipeline_stages.kind`): em aberto (`OPEN`), ganho (`WON`) e perdido (`LOST`), além do total.
3. Permitir recortes por período de previsão de fechamento, funil e responsável.

## Escopo

### API

- `GET /api/v1/reports/sales-by-product`, protegido por `reports.read` (ADMIN e MANAGER; SELLER e VIEWER recebem 403);
- parâmetros opcionais (contrato `SalesByProductQuerySchema`, estrito):
  - `from` e `to`: data-hora ISO com fuso, aplicadas a `opportunities.expectedCloseAt` com limites **inclusivos** (`>=`/`<=`, mesma semântica de `expectedCloseFrom/To` da listagem de oportunidades). Com qualquer um deles informado, oportunidades sem previsão de fechamento ficam de fora;
  - `pipelineId` e `ownerUserId`: UUIDs;
  - `from > to`, UUID ou data inválidos e qualquer outro parâmetro (inclusive `organizationId`) dão 400 `VALIDATION_ERROR`;
- base do cálculo: itens de oportunidades **não excluídas** do tenant. Produtos desativados ou excluídos depois da venda continuam no relatório (o item é histórico) e vêm sinalizados por `productActive` e `productDeleted`. Produtos sem itens no recorte não aparecem;
- por produto, os blocos `open`, `won`, `lost` e `total`, cada um com:
  - `quantity`: soma das quantidades, string com 3 casas;
  - `opportunities`: número de oportunidades **distintas** (um produto repetido na mesma oportunidade conta uma vez);
  - `value`: soma de `lineTotal`, string com 2 casas;
- `totals` com os mesmos quatro blocos para o relatório inteiro; `totals.*.opportunities` conta oportunidades distintas entre todos os produtos;
- ordenação: valor ganho desc, depois valor em aberto desc, depois nome do produto e id (determinística);
- resposta traz `asOf` e o eco dos `filters` normalizados (datas em UTC ou `null`).

### Implementação

- `SalesByProductService` executa duas consultas SQL agregadas (`$queryRaw` parametrizado com `Prisma.sql`) dentro de `prisma.withTenant`, em transação `RepeatableRead` para as duas leituras enxergarem o mesmo snapshot;
- além do RLS, todas as junções usam `organization_id` e o `WHERE` filtra `oi.organization_id` explicitamente;
- somas feitas no PostgreSQL em `numeric` e devolvidas como texto; a soma de `total` e a formatação usam `bigint` em escala fixa, sem ponto flutuante (valores de até `DECIMAL(19,2)` são exatos);
- a resposta é validada com `SalesByProductReportSchema` antes de sair; erro de banco vira 5xx, nunca zeros silenciosos.

### Contratos

`packages/contracts/src/sales-by-product.ts`: `SalesByProductQuerySchema`, `SalesByProductReportSchema`, `SalesByProductRowSchema`, `SalesByProductBucketSchema`, `ReportMoneySchema`, `ReportQuantitySchema` e tipos, exportados no `index`.

### Web

- a tela **Resumo gerencial** ganha abas (`role="tablist"`): **Indicadores** (conteúdo atual) e **Vendas por produto**; a visibilidade continua a da seção (`reports.read`);
- a aba de vendas tem filtro de período (datas `De`/`Até` no fuso local, convertidas para início e fim do dia em ISO), botões Aplicar e Limpar, validação de período invertido no cliente e tabela com produto, em aberto, ganho, perdido e total (valor em BRL, quantidade e número de oportunidades), mais a linha **Total geral**;
- a aba só consulta a API quando aberta.

## Fora do escopo

Exportação CSV/PDF, gráficos, metas e comissões, filtros de funil e responsável na UI (a API já aceita), agrupamento por categoria de produto e comparação entre períodos.

## Segurança e integridade

- consulta sempre dentro de `withTenant`, com RLS `FORCE` das tabelas e filtro explícito por organização;
- filtros por `pipelineId`/`ownerUserId` de outro tenant apenas retornam vazio, sem revelar existência;
- nenhum schema de banco alterado.

## Critérios de aceite

1. ADMIN e MANAGER recebem o mesmo relatório; SELLER e VIEWER recebem 403; sem sessão, 401.
2. Itens são somados por produto e por situação da etapa; oportunidades excluídas ficam de fora; produto repetido numa oportunidade conta uma oportunidade.
3. `from`/`to`, `pipelineId` e `ownerUserId` restringem o resultado e podem ser combinados; o limite de `to` é inclusivo.
4. Dados de outro tenant nunca aparecem; filtros com IDs de outro tenant retornam vazio.
5. Valores são strings com 2 casas (quantidades com 3), exatos para somas grandes.
6. Parâmetros inválidos ou desconhecidos dão 400.
7. Na web, a aba **Vendas por produto** aparece dentro do Resumo gerencial e filtra por período.

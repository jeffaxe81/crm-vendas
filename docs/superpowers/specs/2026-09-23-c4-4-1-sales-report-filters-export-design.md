# C4.4.1 — Relatório de vendas por produto: filtros de funil/responsável e exportação CSV — Design

## Contexto

A C4.4 entregou `GET /api/v1/reports/sales-by-product` (`reports.read`) com os filtros `from`, `to`, `pipelineId` e `ownerUserId`, e a aba **Vendas por produto** no Resumo gerencial, que expunha só o filtro de período. Esta entrega completa o relatório: seletores de funil e responsável na tela e exportação CSV para Excel pt-BR, sem mudar o schema nem a agregação.

## Objetivo

1. Filtrar o relatório na tela por funil e por responsável, combináveis com o período.
2. Exportar exatamente o que a tabela mostra (mesmos filtros e mesma agregação) em CSV que o Excel em português abre corretamente.

## Escopo

### API

- `GET /api/v1/reports/sales-by-product/export` (`reports.read`):
  - aceita e valida os mesmos parâmetros do relatório (`SalesByProductQuerySchema`, estrito): parâmetro inválido ou desconhecido dá 400 `VALIDATION_ERROR` em JSON, sem `Content-Disposition`;
  - reutiliza `SalesByProductService.read` (mesma transação `RepeatableRead`, RLS e filtro explícito por tenant) e só formata o resultado;
  - resposta `200` com `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="vendas-por-produto-AAAA-MM-DD.csv"` (data do `asOf` no fuso `America/Sao_Paulo`) e `Cache-Control: no-store`;
  - corpo: BOM UTF-8, separador `;`, quebra de linha CRLF, cabeçalho em português (`Código`, `Produto`, `Situação do produto` e, para `Em aberto`, `Ganho`, `Perdido` e `Total`, as colunas `quantidade`, `oportunidades` e `valor (R$)`), uma linha por produto na ordem do relatório e a linha final **Total geral**;
  - números com vírgula decimal e sem separador de milhar (`2500,50`, `3,500`), preservando a exatidão das strings do relatório (sem ponto flutuante);
  - situação do produto: `Ativo`, `Inativo` ou `Excluído`;
  - proteção contra injeção de fórmula: campos de texto iniciados por `=`, `+`, `-`, `@`, tabulação ou retorno de carro recebem aspa simples no início; em seguida aplica-se o escape RFC 4180 (aspas quando há `;`, `"` ou quebra de linha, com `"` duplicada).
- `GET /api/v1/reports/sales-by-product/owners` (`reports.read`), fonte do seletor de responsável:
  - o diretório de usuários existente (`GET /admin/users`) exige `user.manage`, que o MANAGER não tem; por isso a lista vem dos **donos de oportunidades não excluídas do tenant**;
  - devolve `[{ userId, displayName, membershipActive }]` ordenado por nome, sem e-mail nem papel; `membershipActive` é falso quando o vínculo ou o usuário estão inativos (o histórico continua filtrável);
  - não aceita parâmetros (400).
- CORS: `Content-Disposition` passa a ser exposto (`exposedHeaders`) para o navegador ler o nome do arquivo.

### Contratos

`packages/contracts/src/sales-by-product-filters.ts`: `SalesByProductOwnerSchema`, `SalesByProductOwnersSchema` e o tipo `SalesByProductOwner`, exportados no fim do `index`.

### Web

- a aba **Vendas por produto** ganha os seletores **Funil** (funis ativos de `GET /pipelines`, como na tela de oportunidades) e **Responsável** (da rota acima; inativos marcados com "(inativo)"), ambos com a opção "Todos"; Aplicar envia `pipelineId`/`ownerUserId` junto do período; Limpar zera tudo;
- falha ao carregar as opções não bloqueia o relatório: mostra um aviso e mantém o que carregou;
- botão **Exportar CSV**: baixa com os filtros **aplicados** (os da tabela visível) via `fetch` com `Authorization: Bearer`, `blob` e link temporário (`URL.createObjectURL`, removido e revogado em seguida). Usa o nome do `Content-Disposition` e, se indisponível, `vendas-por-produto-AAAA-MM-DD.csv` com a data local; erros aparecem em alerta; o botão fica desabilitado durante a exportação, o carregamento ou com erro no relatório.
- helper reutilizável `apps/web/src/lib/api-download.ts` (`downloadAuthenticatedFile`).

## Organização do código (redução de conflitos)

Lógica nova em arquivos novos (`sales-by-product-csv.ts`, `sales-by-product-owners.service.ts`, `sales-by-product-filters.ts`, `api-download.ts`); em `reports.controller.ts`, `reports.module.ts` e `contracts/src/index.ts` apenas acréscimos no fim das classes/listas. `management-summary-view.tsx` não foi alterado.

## Fora do escopo

Exportação PDF/XLSX, colunas de filtros aplicados dentro do CSV, relatório por vendedor, seletor de responsável baseado no diretório completo de membros (exigiria uma permissão de leitura de usuários separada de `user.manage`).

## Segurança e integridade

- exportação e lista de responsáveis passam por `withTenant` com RLS e filtro explícito por organização; IDs de outro tenant só produzem CSV vazio (cabeçalho + total zerado);
- SELLER e VIEWER recebem 403 nas duas rotas; sem sessão, 401;
- a lista de responsáveis não expõe e-mail;
- neutralização de fórmulas nas células de texto controladas pelo usuário (código e nome do produto).

## Critérios de aceite

1. A exportação devolve o mesmo conteúdo agregado do relatório JSON, no formato descrito, com os cabeçalhos HTTP corretos.
2. Os filtros `from`, `to`, `pipelineId` e `ownerUserId` valem na exportação; parâmetros inválidos dão 400.
3. Dados de outro tenant nunca aparecem na exportação nem na lista de responsáveis.
4. ADMIN e MANAGER exportam o mesmo arquivo; SELLER e VIEWER recebem 403.
5. Nome de produto com `=`, `+`, `-` ou `@` no início sai prefixado com aspa simples.
6. Na web, funil e responsável vão para a query da API e o botão **Exportar CSV** baixa o arquivo com os filtros atuais e o token Bearer.

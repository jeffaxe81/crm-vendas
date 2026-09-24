# C4.3.3 — Edição de itens da oportunidade e jornada E2E de produtos — Design

## Contexto

O C4.3/C4.3.1 entregou o catálogo de produtos e os itens de oportunidade com valor derivado. A API já aceita `PATCH /api/v1/opportunities/:id/items/:itemId` com `{ quantity?, unitPrice?, discountPercent?, version }`, mas a UI só incluía e removia itens. Também faltavam um teste de navegação da seção Produtos e uma jornada E2E cobrindo o fluxo de produtos.

## Objetivo

1. Permitir alterar quantidade, preço unitário e desconto de um item existente na tela de Oportunidades.
2. Cobrir a navegação da seção Produtos por permissão.
3. Validar ponta a ponta o fluxo produto → oportunidade → item → valor recalculado.

## Escopo

### Web — edição em linha

- no painel **Itens**, cada linha ganha a ação **Editar** (somente com `opportunity.write`). A linha passa a exibir campos de quantidade, preço unitário e desconto (%), com **Salvar** e **Cancelar**; só uma linha fica em edição por vez e, durante a edição, as ações das outras linhas ficam desabilitadas;
- os campos vêm preenchidos com os valores atuais em formato brasileiro (`12.50` → `12,5`);
- entrada com vírgula decimal é aceita, inclusive com separador de milhar (`1.234,50` → `1234.50`). Sem vírgula, o ponto é tratado como decimal (`12.5`). A mesma normalização (`normalizeDecimal`) passa a valer para inclusão de itens e para o preço do cadastro de produtos;
- o `PATCH` envia os três campos e o `version` atual da oportunidade. A resposta substitui o item na tabela e o `estimatedValue`/`version` da oportunidade é propagado por `onOpportunityChange`;
- em 409 (`OPPORTUNITY_VERSION_CONFLICT`) a tela mostra uma mensagem clara pedindo para recarregar a página, mantém os valores digitados e não altera a oportunidade. A mesma mensagem vale para inclusão e remoção;
- para distinguir o 409, `apiRequest` passa a lançar `ApiError` (subclasse de `Error` com `status`). Quem só usa `message` continua funcionando.

### Testes

- web: edição com sucesso (vírgula decimal, corpo do `PATCH`, propagação de valor e versão), 409, cancelamento, ausência da ação sem `opportunity.write` e normalização decimal;
- web: `page-products-navigation.test.tsx` — a seção Produtos aparece com `product.read` e some sem ela (sem chamar `/products`);
- E2E `tests/e2e/products-items.spec.ts`: login → criar produto → criar empresa e oportunidade → adicionar item com desconto → conferir o valor → editar quantidade → conferir o novo valor → remover o item (valor volta a 0,00).

## Fora do escopo

- mudanças de API ou schema (a API já atende);
- recarregar automaticamente a oportunidade após 409 (a decisão é pedir recarga explícita);
- troca do produto de um item existente (remove-se e inclui-se outro).

## Critérios de aceite

1. Com `opportunity.write`, alterar um item atualiza a linha, o total da oportunidade e a versão.
2. Um `version` desatualizado mostra a mensagem de recarga e não altera nada na tela.
3. Sem `opportunity.write`, o painel é somente leitura.
4. A seção Produtos só aparece com `product.read`.
5. A jornada E2E nova e as 4 existentes passam.

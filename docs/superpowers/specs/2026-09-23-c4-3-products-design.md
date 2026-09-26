# C4.3 — Produtos e itens de oportunidade — Design

## Contexto

A Fase 2 — Produtividade concluiu o bloco de Importação (C4.2.1 a C4.2.3). O próximo bloco do roadmap é **Produtos**. Decisão de produto (23/09/2026): o produto não é só um catálogo; ele entra nas oportunidades como **itens com quantidade e desconto**, e o **valor da oportunidade passa a ser calculado a partir dos itens**.

## Objetivo

1. Manter um catálogo de produtos/serviços por organização.
2. Compor oportunidades com itens do catálogo, cada um com quantidade, preço unitário e desconto.
3. Derivar `estimatedValue` da oportunidade da soma dos itens, com consistência transacional e auditoria.

## Escopo

### C4.3 — Catálogo de produtos

- tabela `products` (tenant, RLS) com `code` (até 60 caracteres), `name` (até 200), `description`, `unitPrice` (decimal 19,2, ≥ 0), `isActive`, `version`, auditoria de autoria e exclusão lógica;
- `code` é único por organização entre produtos não excluídos, sem diferenciar maiúsculas de minúsculas (índice único parcial);
- API `/api/v1/products`: listar (busca por código/nome, paginação, filtro de ativos), consultar, criar, editar com `version` e excluir logicamente;
- permissões novas: `product.read` (todos os perfis) e `product.write` (ADMIN e MANAGER). SELLER consulta o catálogo, mas não o altera;
- auditoria `product.created`, `product.updated` e `product.deleted`.

### C4.3.1 — Itens da oportunidade

- tabela `opportunity_items` (tenant, RLS) com FKs compostas por organização para oportunidade e produto;
- cada item guarda um **snapshot**: `description` (nome do produto no momento), `unitPrice` (preço do catálogo, que pode ser sobrescrito na inclusão), `quantity` (decimal 12,3, > 0), `discountPercent` (decimal 5,2, de 0 a 100) e `lineTotal` (decimal 19,2);
- `lineTotal = arredonda2(quantity × unitPrice × (1 − discountPercent/100))`, com arredondamento _half-up_;
- API aninhada em `/api/v1/opportunities/:id/items`:
  - `GET` (`opportunity.read`);
  - `POST { productId, quantity, unitPrice?, discountPercent?, version }` (`opportunity.write`);
  - `PATCH /:itemId { quantity?, unitPrice?, discountPercent?, version }` (`opportunity.write`);
  - `DELETE /:itemId?version=N` (`opportunity.write`);
- toda mutação de item roda **na mesma transação** que recalcula `estimatedValue = Σ lineTotal` e incrementa `version` da oportunidade. O `version` informado é o da oportunidade, o que dá concorrência otimista e devolve 409 em conflito;
- a resposta das mutações traz o item e a oportunidade atualizada;
- só produtos ativos e não excluídos podem ser adicionados. Produtos desativados ou excluídos depois continuam nos itens existentes pelo snapshot;
- auditoria `opportunity.item_added`, `opportunity.item_updated` e `opportunity.item_removed`, com `metadata` contendo `estimatedValue` antes e depois e as versões.

### Regra do valor da oportunidade

- **Oportunidade com itens:** `estimatedValue` é derivado. Um `PATCH /opportunities/:id` com `estimatedValue` responde 400 `OPPORTUNITY_VALUE_DERIVED`.
- **Oportunidade sem itens:** o comportamento atual continua, com valor informado manualmente.
- **Ao remover o último item:** o valor passa a 0,00 (soma vazia) e volta a ser editável manualmente.

### Web

- nova seção **Produtos** na navegação (visível com `product.read`): lista com busca, criação, edição e exclusão (ações com `product.write`);
- na tela de Oportunidades, painel **Itens** por oportunidade: tabela de itens, total, inclusão (produto, quantidade, desconto) e remoção (com `opportunity.write`).

## Fora do escopo

- tabelas de preço, moedas, impostos, frete e descontos por faixa;
- estoque, unidades de medida e variações de produto;
- importação CSV de produtos;
- propostas/orçamentos em PDF;
- desconto global na oportunidade.

## Segurança e integridade

- RLS `FORCE` nas duas tabelas, pela mesma política `app.current_organization_id` das demais;
- FKs compostas `(id, organization_id)` impedem referência cruzada entre tenants;
- `CHECK`s de banco: preço ≥ 0, quantidade > 0, desconto entre 0 e 100, total ≥ 0;
- o valor é recalculado no servidor; o cliente nunca envia `lineTotal` nem o total.

## Critérios de aceite

1. VIEWER lista produtos, mas recebe 403 ao criar; SELLER também recebe 403 ao criar.
2. Um código duplicado (ignorando caixa) no mesmo tenant dá 409. O mesmo código em outro tenant é aceito.
3. Adicionar, alterar e remover itens recalcula `estimatedValue` e incrementa `version`, com auditoria.
4. Um `version` desatualizado dá 409 e não grava nada.
5. Um produto inativo, excluído ou de outro tenant não pode ser adicionado (404/400).
6. Um `PATCH` de `estimatedValue` numa oportunidade com itens dá 400.
7. Testes existentes continuam verdes; migration aplicável em banco limpo e no existente.

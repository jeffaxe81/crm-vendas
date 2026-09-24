# C4.3.2 — Importação CSV de Produtos — Design

## Contexto

A C4.3 entregou o catálogo de produtos (`/api/v1/products`, permissões `product.read`/`product.write`, código único por tenant sem diferenciar maiúsculas de minúsculas entre produtos não excluídos, auditoria `product.*`). As importações de empresas (C4.2.1) e de contatos (C4.2.2/C4.2.3) já seguem o fluxo **Preview → Confirmar** sobre o parser genérico `apps/api/src/csv/csv-table-parser.ts`. A importação de produtos ficou explicitamente fora do escopo da C4.3 e é o objeto desta microentrega.

## Objetivo

Permitir que um usuário com `product.write` cadastre até 500 produtos por arquivo CSV, com validação por linha no preview, confirmação explícita e resumo final, reaproveitando as regras de criação da C4.3.

## Escopo da C4.3.2

Incluído:

- endpoints `POST /api/v1/product-imports/preview` e `POST /api/v1/product-imports/confirm` (multipart, campo `file`; `fingerprint` na confirmação);
- permissão `product.write` nos dois endpoints (ADMIN e MANAGER; SELLER e VIEWER recebem 403);
- limite de 500 linhas de dados e 8 MB por arquivo, extensão `.csv`;
- reutilização do `CsvTableParser` (UTF-8/BOM, `,` ou `;`, aspas, linhas vazias ignoradas) e do `ProductCreateInputSchema`;
- fingerprint SHA-256 do conteúdo normalizado entre preview e confirmação;
- criação por `ProductsService.create`, preservando a pré-checagem de código, o índice único e a auditoria `product.created` com o `x-request-id` da confirmação;
- `ProductsService.existingCodes` para a checagem em lote de códigos já usados no tenant;
- contratos `ProductImport*` em `@axes/contracts`;
- UI na tela de Produtos: botão **Importar CSV** (só com `product.write`), preview com erros por linha, confirmação e resumo.

Fora do escopo:

- atualização de produtos existentes (upsert), merge ou sobrescrita;
- XLS/XLSX, mapeamento manual de colunas, filas e jobs persistentes;
- mudanças no schema do banco.

## Formato do CSV

```text
code,name,unitPrice,description,isActive
```

Regras:

- `code`, `name` e `unitPrice` são obrigatórios no cabeçalho e em cada linha;
- `description` e `isActive` são opcionais; a ordem das colunas pode variar;
- colunas desconhecidas ou duplicadas, aspas não encerradas, colunas extras preenchidas e mais de 500 linhas invalidam o arquivo inteiro (400);
- `unitPrice` aceita ponto ou vírgula como separador decimal (`1200.50`, `1200,50`, `2500`) e é normalizado com `.` para o formato do `OpportunityDecimalSchema` (até 17 dígitos inteiros e 2 casas). Valores com separador de milhar (`1.200,50`) ou negativos são rejeitados na linha;
- `isActive` aceita `true`/`false`, `sim`/`não` (ou `nao`) e `1`/`0`, sem diferenciar caixa; vazio significa ativo.

## Regras de validação por linha

- erros do `ProductCreateInputSchema` são reportados como `<campo>: <mensagem>`;
- `isActive` não reconhecido: `isActive: informe true/false, sim/não ou 1/0.`;
- código repetido no arquivo, sem diferenciar caixa: `Código duplicado no arquivo de importação.` (a primeira ocorrência continua válida);
- código já usado por produto não excluído do tenant: `Código já cadastrado para outro produto.`; produtos excluídos logicamente não bloqueiam o reuso, como na C4.3;
- uma linha inválida não impede as válidas; nada é gravado no preview.

## Confirmação

- recalcula o preview a partir do arquivo reenviado e recusa com 400 um fingerprint divergente;
- cria somente as linhas válidas, uma a uma, via `ProductsService.create`;
- se outra requisição cadastrar o mesmo código entre a validação e a criação (409 do serviço), apenas aquela linha é rejeitada com `Código já cadastrado para outro produto.` e as demais seguem;
- devolve `processed`, `imported`, `rejected` e o resultado por linha com `productId`.

## Segurança e isolamento

- o tenant vem exclusivamente do principal autenticado;
- `existingCodes` e as criações rodam dentro de `withTenant` (RLS) e só enxergam o tenant atual; um código existente em outro tenant não gera erro.

## Critérios de aceite

1. SELLER e VIEWER recebem 403 no preview e na confirmação.
2. O preview não grava nada e reporta erros por linha, com preço e situação normalizados nas linhas válidas.
3. Código duplicado no arquivo ou já existente no tenant é rejeitado na linha; código de outro tenant ou de produto excluído não.
4. A confirmação cria só as linhas válidas e audita `product.created` com o `x-request-id` da requisição.
5. CSV inválido, arquivo ausente, extensão diferente de `.csv`, fingerprint ausente ou divergente devolvem 400.
6. A tela de Produtos mostra **Importar CSV** apenas para sessões com `product.write` e recarrega a lista após confirmar.
7. As suítes da C4.2.x e da C4.3 continuam passando sem alteração.

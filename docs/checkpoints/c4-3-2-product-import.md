# Checkpoint — C4.3.2 Importação CSV de produtos

Data: 23/09/2026
Branch: `feat/c4-3-2-product-import`
Design: `docs/superpowers/specs/2026-09-23-c4-3-2-product-import-design.md`
Status: implementada e validada localmente pelo gate completo; aguardando integração à `develop`.

## Construído

- módulo `apps/api/src/product-imports` (`ProductImportModule`): `POST /api/v1/product-imports/preview` e `/confirm` (multipart `file`, `fingerprint` na confirmação), permissão `product.write`, limite de 8 MB e extensão `.csv`;
- `ProductCsvParser` sobre o `CsvTableParser` genérico (colunas `code`, `name`, `unitPrice` obrigatórias; `description`, `isActive` opcionais; até 500 linhas), com `normalizeCsvDecimal` (ponto ou vírgula decimal → `.`) e `parseCsvBoolean` (true/false, sim/não/nao, 1/0);
- `ProductImportService`: validação por linha com `ProductCreateInputSchema`, código duplicado no arquivo (sem diferenciar caixa) e código já existente entre produtos não excluídos do tenant geram erro na linha; fingerprint SHA-256; a confirmação recalcula o preview, recusa fingerprint divergente e cria só as linhas válidas via `ProductsService.create` (auditoria `product.created` e regra de unicidade preservadas). Um 409 de corrida rejeita apenas a linha afetada;
- `ProductsService.existingCodes` (consulta em lote, dentro de `withTenant`);
- contratos `ProductImportRowData`, `ProductImportPreview(Row)`, `ProductImportResult(Row)` em `packages/contracts/src/product-imports.ts`, exportados no `index.ts`;
- web: botão **Importar CSV** na tela de Produtos (somente com `product.write`) abrindo `ProductImportPanel` com preview (preço normalizado em BRL, situação, erros por linha), confirmação desabilitada sem linhas válidas, resumo e recarga da lista.

## Evidência de testes (local, PostgreSQL 16, banco limpo)

- `prettier --check .`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente); `pnpm lint` e `pnpm typecheck`: OK;
- API: 44 suítes / 183 testes, todos verdes (novos: `product-csv-parser.spec` 13, `product-import.service.spec` 7, `product-import.integration.spec` 5 — 403 para SELLER e VIEWER, isolamento de código entre tenants e reuso de código excluído, confirmação com normalização e auditoria `product.created` pelo `x-request-id`, 400 para CSV inválido, arquivo ausente, extensão, fingerprint ausente e divergente);
- contratos: 7 arquivos / 30 testes (contratos novos são somente tipos); web: 21 arquivos / 53 testes (novos: `product-import-view.test` 3);
- `test:repo` 6/6; `pnpm build` OK.

## Decisões preservadas

- mesmo fluxo e mensagens de erro de arquivo das importações C4.2.x; o parser genérico não foi alterado;
- a criação passa pelo `ProductsService.create`, sem caminho paralelo de escrita; sem alteração de schema/migrations;
- preço com os dois separadores (`1.200,50`) é rejeitado na linha em vez de adivinhado;
- produtos excluídos logicamente não bloqueiam o reuso do código, como na C4.3.

## Fora do escopo (mantido)

Atualização de produtos existentes (upsert), XLS/XLSX, mapeamento manual de colunas, filas/jobs e importação de itens de oportunidade.

## Próximo passo

Relatórios da Fase 2, começando por vendas por produto; eventualmente upsert por código na importação, se o produto pedir.

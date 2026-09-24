# Checkpoint — C4.3.3 Edição de itens da oportunidade e E2E de produtos

Data: 23/09/2026
Branch: `feat/c4-3-3-item-editing-e2e`
Design: `docs/superpowers/specs/2026-09-23-c4-3-3-item-editing-e2e-design.md`
Status: implementada e validada localmente pelo gate completo, incluindo E2E.

## Construído

- painel **Itens** (`opportunity-items-panel.tsx`): edição em linha de quantidade, preço unitário e desconto, com Salvar/Cancelar, somente com `opportunity.write`. O `PATCH` envia o `version` da oportunidade; a resposta atualiza o item e propaga `estimatedValue`/`version` via `onOpportunityChange`;
- 409 mostra "Esta oportunidade foi alterada em outra operação. Recarregue a página…" (edição, inclusão e remoção), mantendo os valores digitados;
- `normalizeDecimal`: vírgula decimal com separador de milhar (`1.234,50` → `1234.50`), usada na edição, na inclusão de itens e no preço do cadastro de produtos. Antes, `1.500,00` no cadastro de produtos virava `1.500.00` e era recusado pela API (correção de UI, sem mudança de API);
- `apiRequest` passa a lançar `ApiError` com `status` (compatível com `Error`);
- teste de navegação da seção Produtos (`page-products-navigation.test.tsx`);
- E2E `tests/e2e/products-items.spec.ts`: produto a 1.500,00 → item 2 × 10% de desconto = 2.700,00 → quantidade 2,5 = 3.375,00 → remoção = 0,00.

## Evidência de testes (local, PostgreSQL 16, banco limpo)

- `prettier --check`: OK, exceto `.github/workflows/ci.yml` (CRLF preexistente); lint e typecheck: OK;
- `test:repo`: 6/6;
- API: 41 suítes / 158 testes (sem alterações);
- contratos: 7 arquivos / 30 testes;
- web: 21 arquivos / 57 testes (7 novos: 5 de edição/normalização, 2 de navegação);
- build: OK;
- E2E (Playwright, Chromium local): 5/5 (4 existentes + o novo).

## Decisões preservadas / fora do escopo

- API e schema não foram alterados; nenhum bug de API encontrado;
- após 409 não há recarga automática: o usuário recarrega explicitamente;
- sem vírgula, o ponto é decimal (`1.500` = 1,5); com vírgula, pontos são separadores de milhar;
- troca de produto de um item continua sendo remover e incluir.

## Próximo passo

Relatórios da Fase 2, começando por vendas por produto.

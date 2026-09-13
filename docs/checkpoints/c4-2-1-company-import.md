# Checkpoint — C4.2.1 Importação CSV de Empresas

Data: 13/09/2026
Branch: `feat/c4-2-1-company-import`
PR: #38 (Draft)
Status: implementada na branch e validada pelo gate específico da C4.2.1; ainda não mesclada em `main`.

## Construído

- parser CSV server-side com UTF-8/BOM, delimitadores `,` e `;`, campos entre aspas e limite de 500 linhas;
- contratos compartilhados de preview e resultado;
- preview sem persistência, validado pelo `CompanyCreateInputSchema`;
- duplicidade por `document` no mesmo tenant e dentro do arquivo;
- fingerprint SHA-256 entre preview e confirmação;
- confirmação com revalidação e importação parcial apenas das linhas válidas;
- criação exclusivamente por `CompaniesService.create()`, preservando auditoria;
- endpoints multipart `/company-imports/preview` e `/company-imports/confirm` protegidos por `company.write`;
- isolamento multiempresa derivando tenant somente do principal autenticado;
- UI integrada em Empresas com seleção do CSV, tabela de preview, erros por linha, confirmação e resumo final;
- cliente HTTP com suporte a `FormData` sem definir manualmente `Content-Type`;
- visibilidade da ação de importação ligada à permissão real `company.write` da sessão.

## Evidência de testes

Gate específico C4.2.1 — run `34748105751`, job `103699638105`: **SUCCESS**.

- unitários API: 2 suites / 15 testes — PASS;
- integração API: 1 suite / 4 testes — PASS;
- Web: cenário Preview → Confirmar, confirmação desabilitada sem linhas válidas e ocultação sem `company.write` — PASS;
- migrations e role `axes_app` provisionadas no ambiente de CI — PASS.

O primeiro ciclo Web revelou falta de teardown entre cenários. A causa raiz foi estado DOM compartilhado no arquivo de teste; foi corrigida com `cleanup()` no `afterEach`, sem alteração de comportamento de produção.

## Decisões preservadas

- sem migration ou tabela de job de importação;
- sem fila/worker;
- sem update, merge ou sobrescrita automática;
- sem deduplicação por nome;
- sem importação de contatos nesta microentrega;
- uma linha inválida não reverte as linhas válidas já importadas.

## Gate do repositório

O workflow geral `Cycle 1 quality gate` continua encontrando dívida de formatação preexistente em arquivos fora do escopo da C4.2.1. Esses arquivos não foram alterados apenas para mascarar o problema. Antes do merge, o PR deverá permanecer Draft até o gate final ser avaliado/resolvido e houver aprovação explícita.

## Próximo passo

Remover o workflow temporário da C4.2.1, revisar o diff final do PR #38 e executar a verificação final. Após aprovação e merge da C4.2.1, seguir para a próxima microentrega de Importação sem antecipar Produtos/Relatórios.

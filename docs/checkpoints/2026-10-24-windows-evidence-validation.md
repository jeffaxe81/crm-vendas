# Reconciliação de caminhos de evidência no Windows — 24/10/2026

Base reconciliada: `22400048e0c93d4b053133d46bdd8893fb15baa2` (`main` após PR #303).
Branch: `fix/real-evidence-validation`.

## Contexto

A PR #303 já integrou à `main` a rejeição de datas inexistentes normalizadas por
`Date.parse` e de responsável `to_be_assigned` com espaços. Esta reconciliação
não substitui nem reimplementa esses controles.

O incremento preservado da antiga branch #305 é exclusivamente a portabilidade
das verificações de contenção de caminhos para Windows e Linux.

## Correções preservadas

- `release-evidence-check.mjs` usa o separador nativo ao validar se arquivos
  permanecem dentro da pasta do manifesto;
- `release-evidence-init.mjs` usa o separador nativo ao restringir o destino
  privado das evidências;
- o teste de evidências rejeita um arquivo existente fora da pasta do manifesto;
- o teste de exposição do RESTORE usa `path.sep` ao excluir apenas os arquivos
  internos autorizados.

## Segurança

Essas mudanças continuam fail-closed. Nenhuma evidência externa é autenticada,
nenhum deploy é autorizado e `productionApproved` permanece `false`.

Os gates operacionais e de homologação real permanecem independentes. CI verde
deste incremento comprova apenas compatibilidade técnica e regressão automatizada.

## Proveniência

A branch original #305 foi criada sobre a branch da PR #299 e ficou divergente
da `main` após os merges #299 e #303. Para evitar regressão, a reconciliação foi
feita em um merge commit com árvore baseada na `main` atual, reaplicando apenas
as diferenças exclusivas de contenção de caminhos e seus testes.

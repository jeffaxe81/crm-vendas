# Retenção segura com prévias e operações de restauração

**Data:** 22/10/2026  
**Base validada:** `main` no commit `6fda820113a3143d5c01d9e4e5468e571d7cf411`.

## Lacuna corrigida

A exclusão manual já considera prévias de restauração, mas o expurgo automático ainda não consultava referências de `OperationPreview` e verificava somente operações `PENDING/RUNNING`. Como ambas as relações são protegidas por chaves estrangeiras `ON DELETE RESTRICT`, uma cópia mais antiga poderia ser selecionada para exclusão mesmo que houvesse uma prévia ativa, consumida ou expirada, ou uma operação encerrada associada.

## Regras implementadas

- Antes de qualquer exclusão por retenção, a transação obtém o advisory lock **exclusivo** de manutenção do tenant. A publicação de prévias usa o lock **compartilhado** correspondente, de modo que nenhuma nova prévia possa ser gravada entre a verificação de referências e a exclusão do catálogo.
- Sob o lock de manutenção e o lock próprio de retenção, o expurgo recusa candidatos com qualquer `OperationPreview.targetBackupId` ou `DataOperation.preventiveBackupId`, **independentemente do estado ou validade temporal**.
- Referências expiradas ou históricas só podem ser eliminadas por um fluxo separado e auditado, nunca como efeito colateral da retenção.
- Mantidas as proteções das PRs #281 e #282: `PRE_RESTORE` não entra na política comum; quantidade mínima recalculada e integridade da cópia mais recente verificada antes de apagar uma antiga.

## Evidência de regressão

Em ambiente PostgreSQL com RLS e banco descartável, regressões independentes criam nove backups para forçar candidatos além da política de sete cópias. Um cenário publica uma prévia que referencia a cópia antiga; outro cria uma operação `RESTORE` concluída com `preventiveBackupId` apontando para essa cópia. Em ambos os casos, a retenção remove somente o outro candidato elegível e a cópia referenciada permanece acessível no armazenamento.

A suíte usa `TRUNCATE ... CASCADE` para preparar fixtures. **Nunca** executar contra dados reais.

## Limitações

Esta mudança não implementa limpeza de prévias expiradas, reconciliação de objetos órfãos, habilitação de RESTORE, novo endpoint ou implantação. Falhas de armazenamento após commit de exclusão continuam necessitando de fluxo de reconciliação dedicado. Produção permanece **NO-GO** até cumprimento de #159 e #250.

## Gates de aprovação

- [ ] CI integral PostgreSQL/RLS, formatação, lint, TypeScript, build e E2E aprovados no HEAD exato.
- [ ] Merge autorizado pela CI, com revisão de compatibilidade com outras PRs.
- [ ] Verificação `push/main`, `source_manifest` e artefato do SHA integrado.
- [ ] Homologação independente de ambiente e aceite operacional.

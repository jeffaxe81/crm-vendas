# Exclusão manual de backup com referências históricas de RESTORE

**Data:** 22/10/2026  
**Base:** `main` no commit `a0ff7d348731245456295a7f6c9d8d1d0bbe32c1`.

## Problema

A PR #284 passou a proteger o expurgo por retenção contra todas as referências de `OperationPreview.targetBackupId` e `DataOperation.preventiveBackupId`. O endpoint de exclusão manual, porém, ainda considerava somente prévias não consumidas e não expiradas; além disso, só verificava se existiam operações ativas, não se a cópia era referenciada por uma operação histórica. Assim, poderia aceitar uma exclusão que o PostgreSQL recusaria posteriormente devido às chaves estrangeiras `ON DELETE RESTRICT`.

## Mudança defensiva

- Após autorização, lock de manutenção e confirmação de integridade da cópia mais recente, a exclusão manual rejeita backups com **qualquer** prévia de restauração associada, inclusive já consumida ou expirada.
- A exclusão manual rejeita backups referenciados por operações históricas, mesmo concluídas.
- O reconciliador também consulta as referências imediatamente antes de remover o objeto, sob lock de manutenção, preservando cópias com estado legado `DELETING`.
- Não há limpeza silenciosa de prévias ou operações históricas, nem exclusão física antecipada.
- Proteções de backup `PRE_RESTORE` e da cópia mais recente permanecem intactas.

## Testes

O teste integrado PostgreSQL/RLS valida o retorno HTTP 409 com uma prévia expirada/consumida, depois com uma operação concluída. Outra regressão simula uma linha legada `DELETING` referenciada e valida preservação dos bytes e ausência de auditoria `backup.deleted`.

**Importante:** a suíte utiliza banco descartável e prepara fixtures com `TRUNCATE ... CASCADE`. Nunca executar esses testes contra banco de produção.

## Limites e gates

Esta entrega não implementa recuperação automática de objetos órfãos, limpeza de histórico, execução de RESTORE, liberação operacional ou implantação. Qualquer política futura de limpeza de referências exige desenho de retenção e auditoria separado.

- [ ] CI completa no SHA da PR.
- [ ] Merge condicionado à CI verde e à ausência de alterações concorrentes incompatíveis.
- [ ] CI `push/main`, manifesto de origem e artefato do mesmo SHA validados.
- [ ] Homologação operacional #159 e segurança de RESTORE #250 permanecem **NO-GO**.

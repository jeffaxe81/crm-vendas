# CRM — Worker BACKUP não consome operações RESTORE/DELETE

**Data:** 22/10/2026

## Problema

O seletor em `DataOperationWorker.claimNext` consultava apenas estado/lease,
sem filtrar `kind`. Um RESTORE ou DELETE pendente poderia ser reivindicado por
um worker que só tem executor de BACKUP; `processNext` então terminaria
com `UNSUPPORTED_DATA_OPERATION`, deixando um lease indevido e prejudicando
as próximas cópias.

## Correção

A candidatura SQL exige `kind='BACKUP'` antes do
`FOR UPDATE SKIP LOCKED`, sem tocar nas linhas não suportadas. Mantida a
proteção `NOT EXISTS` de qualquer operação RUNNING com lease válido para
o mesmo tenant, inclusive um RESTORE já reclamado por outro executor. Não
foram ampliadas as permissões da aplicação, criados endpoints ou ativada
execução destrutiva.

## Regressões RLS

1. RESTORE/DELETE pendentes mais antigos não impedem BACKUP posterior.
2. Apenas RESTORE/DELETE pendentes resultam em `claimNext=null` e
   `processNext=false` sem incrementar tentativas, reivindicar leases nem
   executar nenhum tipo de operação.
3. RESTORE `RUNNING` com lease válido impede uma reivindicação BACKUP
   simultânea no mesmo tenant.

## Gate

Exigir CI integral com PostgreSQL restrito, source manifest e build. A
correção não implementa executores de RESTORE ou DELETE; mantém GO
operacional do restore como **NO-GO** até #250/#159.

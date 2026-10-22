# CRM Vendas — proteção das cópias PRE_RESTORE contra exclusão

**Data:** 21/10/2026  
**Escopo:** segurança de backup, exclusivamente código de aplicação e testes.  
**Base:** `main` no commit `1c35f2d501c7f4ee1ee26a34219d7ad919304451`.

## Política de proteção

- Cópias com `BackupRecord.reason = PRE_RESTORE` são provas de recuperação criadas antes da restauração, não backups comuns.
- A API de exclusão manual recusa o pedido com HTTP 409 mesmo que a cópia seja `COMPLETED` e outra cópia mais recente exista.
- O reconciliador de exclusão revalida `reason` sob lock antes de remover o arquivo. Um registro legado `PRE_RESTORE/DELETING` não é apagado automaticamente.
- O expurgo por contagem de retenção ignora cópias `PRE_RESTORE` **tanto na seleção inicial quanto na validação imediatamente anterior à exclusão**. Elas não consomem vagas dos backups comuns.
- Um catálogo de cópia preventiva que tenha estado alterado indevidamente requer revisão operacional; não corrigir automaticamente, nem fazer delete físico.
- A política específica de expurgo/arquivamento de cópias preventivas permanece uma decisão separada, com auditoria e autorização.

## Testes de regressão

`apps/api/src/data-management/backup-deletion.integration.spec.ts` inclui:

1. Negativa HTTP 409 de exclusão manual `PRE_RESTORE` e preservação de arquivo durante o expurgo de backups comuns.
2. Reconciliação segura de registro legado `PRE_RESTORE/DELETING`, sem exclusão de arquivo nem auditoria `backup.deleted`.

Executar exclusivamente com banco **descartável**, migrações e função RLS de CI:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @axes/api test --runInBand backup-deletion.integration.spec.ts
pnpm verify
```

**Não** rodar esses testes contra base produtiva: a suite de integração aplica `TRUNCATE ... CASCADE` para limpar fixtures.

## Limites de liberação

Esta entrega não habilita RESTORE produtivo, operações destrutivas, endpoints de restore, nem implantação. O aceite de produção continua **NO-GO** até homologação #159, gates operacionais #250, plano de recuperação pós-falha, espaço disponível e rollback verificados. GitHub Pages segue somente demonstração sem dados reais.

## Gates pós-PR

- [ ] Gate completo da PR, incluindo PostgreSQL/RLS, aprovado no HEAD exato.
- [ ] Integração aprovada e executada de modo não destrutivo contra `main`.
- [ ] CI de `push/main` aprovado no SHA resultante, com manifesto de origem verificado.
- [ ] Homologação operacional e autorização de produção emitidas separadamente.

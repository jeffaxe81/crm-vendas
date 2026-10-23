# CRM restore — preflight bloqueado do destino antes de PRE_RESTORE

Data: 2026-10-22
Base da alteração: `main` no commit `f60044b059c43529fb56f2a16dbb9a80a66116f2`.

## Problema

A primitiva interna `stageRestorePreventiveCopy` já implementa cópia
criptografada imutável, fencing de worker e adoção controlada por UUID
da operação. Mas não exigia que o **backup de destino** continuasse válido
no catálogo enquanto o tenant estava sob a mesma manutenção exclusiva.
Um backup revogado após um `verify` anterior poderia prosseguir até a
publicação preventiva, mesmo que um executor futuro o recusasse depois.

## Mudança

- Novo argumento obrigatório `target: VerifiedBackup`.
- Após comprovar contexto de manutenção e ownership/lease do RESTORE, chamar
  `preflightRestoreExecution` no mesmo `tx`, antes de `BackupStore.put`.
- A validação lê o catálogo `COMPLETED` de novo e confere checksum, versão,
  tamanho e contagens; comprova organização e políticas/identidades/referências,
  inclusive modelos `REPLACE` sem suporte no estado atual **ou** no destino.
- Reexportação da origem permanece sob o mesmo snapshot de manutenção.
  O fingerprint reexportado precisa ser igual ao fingerprint já prevalidado,
  antes de gravar qualquer objeto.
- Preservados UUID determinístico de `DataOperation`, publicação imutável,
  autenticação AES-256-GCM, adoção de órfãos verificados, lease fencing
  posterior ao I/O e vínculo transacional do catálogo.

## Testes propostos

- Casos anteriores: bloqueio de transação sem maintenance, worker errado,
  tentativa cross-tenant, rollback com adoção de órfão, recusa de órfão stale.
- Caso novo: revogação de destino `COMPLETED -> FAILED` após `verify`,
  antes do preflight sob manutenção: sem arquivo, backup ou vínculo.
- Caso novo: existência de `Ticket` atual sem executor de substituição:
  `RESTORE_POLICY_UNSUPPORTED`, sem publicação preventiva e sem perda de dados.
- Exigidos CI completo, PostgreSQL com role RLS restrita, API, TypeScript,
  E2E, build Docker e `source_manifest` no SHA da PR e depois de merge.

## GO / NO-GO

**NO-GO de restauração destrutiva/produção mantido.** Não cria rota,
botão, worker RESTORE nem executa exclusões. Não resolve ciclo completo
de confirmação, restore de Ticket/Event, política de espaço para órfãos,
restauração de segurança ou plano operacional de rollback.

Homologação #159, aceite operacional #250 e evidências de produção
continuam obrigatórios. Não integrar esta PR antes de CI integral verde.

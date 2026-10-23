# RESTORE — orquestração transacional interna com rollback

**Data:** 22/10/2026  
**Base:** `main` @ `b359051c6b2034c972d17b7f7dbab8a83e060539`.  
**Situação:** incremento **interno**, não autorizado para operação real.

## O que foi conectado

A nova função `executeConfirmedRestoreLocked` recebe um único
`Prisma.TransactionClient` pertencente ao `withMaintenance` exclusivo
(`RepeatableRead` ou `Serializable`) e encadeia, nessa ordem:

1. Confere `DataOperation` RESTORE ativa, pertencente ao usuário/tenant
   e ao worker/attempt/lease informados, com `payload.previewId` e
   `payload.targetBackupId` idênticos à confirmação e ao destino.
2. Consome prévia de sessão e senha vigente pelo gate existente
   `consumeRestoreConfirmation` (anti-replay, validade da sessão,
   superusuário, referência e fingerprint sob lock).
3. Publica e autentica cópia AES-256-GCM imutável do estado atual pela
   função `stageRestorePreventiveCopy`, que revalida o catálogo e o
   **arquivo de destino**; registra catálogo PRE_RESTORE e vínculo
   transacional, preservando a adoção segura de órfãos.
4. Executa o grafo **interno já suportado**, por
   `restoreTenantSnapshot`; políticas sem suporte continuam fail-closed.
5. Revalida fencing/lease **após** as mutações, fecha a operação,
   grava checkpoint e auditoria `restore.completed` na **mesma**
   transação.

Se qualquer etapa falhar, todas as mutações SQL, consumo de prévia,
catálogo preventivo, vínculo e auditoria são revertidas. Um arquivo
criptografado já publicado não faz parte do rollback SQL; permanece
privado, não é catalogado como COMPLETED e pode ser adotado em retry
da mesma operação **somente se o conteúdo ainda coincidir com o tenant**.

## Cobertura PostgreSQL/RLS

- Sucesso ponta a ponta em tenant sintético, incluindo confirmação,
  cópia PRE_RESTORE autenticada, checkpoint, auditoria e isolamento de
  outra organização.
- Senha inválida e `payload` de destino incompatível não publicam cópia.
- Lease expirado não consome confirmação nem publica dados.
- Falha induzida **depois** do RESTORE efetivo, **antes** do commit:
  restauração, histórico/auditorias e prévia permanecem inalterados;
  a cópia órfã cifrada pode ser revalidada e adotada no retry.

## Limites críticos

**NÃO criar rota, UI ou worker RESTORE nesta fase.** A função não tem
nenhum chamador operacional. O teste usa `TRUNCATE` e deve ser executado
somente em banco PostgreSQL de testes descartável com role RLS restrita.

A transação de restauração pode ser longa e bloquear a renovação de
leases. O fence final **aborta** com rollback se a validade se perder,
mas o desenho de lease, timeout, interrupção de processo e capacidade
de armazenamento de órfãos exige testes de falha e homologação real.
Outras políticas `REPLACE` e políticas especiais precisam de cobertura
completa. Nenhum GO é concedido por estes testes.

Gates #159 e #250: **NO-GO produção/preview** até homologação integral.
CI da PR no HEAD exato, `push/main` e `source_manifest` obrigatórios
antes de considerar o código integrado.

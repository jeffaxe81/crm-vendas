# CRM — PRE_RESTORE criptografado (21/10/2026)

## Escopo desta entrega

Primitiva **interna** `persistPreventiveRestoreBackup` em
`apps/api/src/data-management/restore-preventive-backup.ts`.
Nenhuma rota, botão, worker RESTORE ou execução destrutiva foi adicionada.

1. Exige a mesma transação `PrismaService.withMaintenance` com isolamento
   `RepeatableRead`/`Serializable` e contexto da organização correta.
2. Revalida backup de destino no catálogo, integridade, políticas de
   restauração, referências e identidade sob o bloqueio exclusivo.
3. Exige uma operação `RESTORE` ainda `RUNNING`, pertencente à empresa,
   com ator definido e sem `preventiveBackupId` anterior.
4. Exporta o estado corrente já bloqueado, compara seu fingerprint com a
   pré-validação e gera snapshot versionado com checksum e limites de tamanho.
5. Publica cópia imutável AES-256-GCM via `BackupStore.put`, relê pelo UUID
   com autenticação do envelope e valida snapshot/checksum antes de gravar
   `BackupRecord` `PRE_RESTORE/COMPLETED`.
6. Na mesma transação, associa `DataOperation.preventiveBackupId` e audita
   `restore.preventive_backup_verified`. Uma falha SQL reverte catálogo,
   associação e auditoria, jamais cria um registro COMPLETED falso.

## Política de retenção e segurança

- Cópias `PRE_RESTORE` não participam do expurgo automático comum.
- Exclusão manual e reconciliação de exclusão recusam `PRE_RESTORE`.
- Não há política de expurgo específica nem executor de recuperação destas
  cópias. Até sua definição e aceite, elas devem ser conservadas.
- Um rollback SQL **não** desfaz um arquivo já criptografado no disco. A cópia
  órfã, não catalogada, permanece privada, nunca habilita restore e requer
  inventário/reconciliação administrativa antes de qualquer remoção.
- `BackupStore` não permite sobrescrever UUID, usa arquivo privado e
  autentica envelope vinculado ao nome por AAD; não há caminho informado
  por usuário. Chaves permanecem fora do banco e do snapshot.

## Evidências esperadas

- Testes `restore-preventive-backup.integration.spec.ts`: publicação e
  autenticação, vínculo por tenant, proibição fora do lock, readback inválido,
  rollback SQL e repetição da operação.
- Testes existentes de exclusão/retenção devem continuar verdes.
- CI obrigatório na PR com testes PostgreSQL/RLS, lint, typecheck,
  formatação, build e demais gates, seguido de CI na `main` após eventual
  integração. Não declarar aprovado até os resultados reais.

## GO / NO-GO

**NO-GO para restauração operacional/produção.** Esta entrega apenas
prepara uma cópia preventiva confiável para uma futura orquestração.
Permanecem pendentes: vincular confirmação de senha à execução atômica,
restaurar o grafo completo e políticas especiais (inclusive `Ticket` /
`TicketEvent`), executar prova de rollback e recuperação, homologação
em ambiente real (#159), aceite de segurança e decisão operacional (#250).

Revisar também política específica de retenção, capacidade/quotas e
reconciliação de órfãos antes de liberar execução.

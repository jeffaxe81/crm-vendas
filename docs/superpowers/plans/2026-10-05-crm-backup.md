# Backup e recuperação do CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Entregar backup, restauração e exclusão protegida por Superusuário no CRM.

**Architecture:** Módulo NestJS com catálogo PostgreSQL, worker persistente e arquivos privados criptografados. A recuperação é isolada por organização, com bloqueio de escritas no banco e substituição transacional; Next.js fornece histórico e confirmações.

**Tech Stack:** TypeScript, NestJS, Prisma, PostgreSQL/RLS, Next.js, Jest e Playwright; usar criptografia nativa do Node.

**Spec:** ../specs/2026-10-05-crm-backup-design.md — aprovado pelo usuário.

## Global Constraints

- Superusuário por associação usuário/organização, não delegável por perfis comuns; nenhuma promoção automática.
- Sessão humana ativa; chaves de integração não terão acesso.
- Aplicação sem BYPASSRLS; nunca restaurar ou apagar outra organização.
- Senha atual, confirmação vinculada à prévia e backup verificado antes de alterações em massa.
- Preservar executor, catálogo de backups e auditoria de segurança.
- America/Sao_Paulo; retenção dos últimos 7, 15, 30 ou 90 backups concluídos.
- Release de teste primeiro; somente dados sintéticos nas verificações destrutivas.
- Ler apps/web/AGENTS.md e documentação instalada do Next.js antes de editar frontend.

## Review Focus

- Escrita iniciada antes do bloqueio: esperar commit anterior antes de criar a cópia preventiva.
- Usuário compartilhado entre organizações: recuperação não altera credencial ou identidade global de terceiros.
- Reinício após commit e antes de finalizar job: operação não se repete.
- Backup legado com novo modelo persistente: versão incompatível é rejeitada antes de qualquer alteração.
- Prévia alterada por outra sessão: confirmação antiga é rejeitada.

## Task 1: Superusuário protegido

**Files:** modificar apps/api/prisma/schema.prisma, apps/api/src/authorization/{authenticated-request.ts,authentication.guard.ts,session.controller.ts}, packages/contracts/src/{auth.ts,index.ts}; criar apps/api/src/authorization/superuser.guard.ts, apps/api/src/scripts/provision-superuser.ts e migration Prisma.

**Interfaces:** principal.isSuperuser: boolean; SuperuserGuard.canActivate(context): Promise<boolean>. A API key sempre recebe false. Provisionamento exige organização e usuário existentes por IDs, sem inferir identidades.

- [ ] Escrever superuser.integration.spec.ts: administrador negado, Superusuário autorizado, API key negada, revogação imediata e payload de usuário/perfil incapaz de promover associação.
- [ ] Rodar `pnpm --filter @axes/api test -- --runTestsByPath src/authorization/superuser.integration.spec.ts`; confirmar falha antes da implementação.
- [ ] Implementar atributo default false, guard consultando associação vigente e extensão do contrato de sessão; atualizar fixtures de sessão.
- [ ] Reexecutar testes de autorização e autenticação; confirmar PASS e verificar migração em banco descartável.
- [ ] Commit `feat: restrict data administration to tenant superusers`.

## Task 2: Catálogo, arquivos e snapshot

**Files:** criar apps/api/src/data-management/{data-management.module.ts,backup-store.ts,backup-manifest.ts,backup.service.ts,tenant-data-registry.ts}; modificar schema.prisma, config/environment.ts e app.module.ts; criar packages/contracts/src/data-management.ts e migration.

**Interfaces:** BackupStore.put(id, bytes): Promise<void>, read(id): Promise<Buffer>, remove(id): Promise<void>; BackupService.create(organizationId, actorId|null, reason): Promise<BackupRecord>; verify(organizationId, backupId): Promise<VerifiedBackup>. Manifest contém schemaVersion, organizationId, createdAt, counts, checksum e conjunto explícito de tabelas.

- [ ] Escrever backup.integration.spec.ts e backup-store.spec.ts com snapshot estável, round-trip, corrupção, falta de espaço, troca de organização e rejeição de versão incompatível.
- [ ] Rodar os dois testes por `pnpm --filter @axes/api test -- --runTestsByPath ...`; confirmar falha.
- [ ] Criar catálogo, jobs e agenda sob RLS, fora do conjunto restaurável. Armazenamento em volume privado durável com escrita temporária e rename atômico; AES-256-GCM com chave fornecida pelo ambiente, permissões restritas e limite de tamanho configurado. Não aceitar caminhos fornecidos pelo cliente.
- [ ] Inventariar todos os modelos persistentes no registry; separar identidades globais, configuração, operacional e controle. Exportar em RepeatableRead; rejeitar backup incompleto e arquivo referenciado sem adaptador disponível. Nunca exportar tokens ativos.
- [ ] Reexecutar testes e testar inventário contra schema.prisma para detectar modelo novo sem política de backup.
- [ ] Commit `feat: add encrypted tenant backup catalog and snapshots`.

## Task 3: Worker, agenda e retenção

**Files:** criar apps/api/src/data-management/{data-operation.worker.ts,backup-schedule.service.ts} e respectivos testes; modificar module e compose.yaml.

**Interfaces:** enqueue(organizationId, kind, payload, actorId|null): Promise<OperationRecord>; claimNext(workerId): Promise<OperationRecord|null>; schedule usa timezone fixo America/Sao_Paulo e frequência diária, semanal ou intervalo em minutos.

- [ ] Escrever worker.integration.spec.ts: duas réplicas reivindicam uma vez, reinício retoma com checkpoint, agenda não duplica, retenção aceita apenas 7/15/30/90 e protege último backup válido e cópia preventiva em uso.
- [ ] Rodar teste e confirmar falha.
- [ ] Implementar claims PostgreSQL com SKIP LOCKED, lease/heartbeat e operações idempotentes. Job mantém checkpoints duráveis; operação destrutiva não é repetida após commit. Acrescentar volume privado e configuração de chave/limites sem segredos no compose.
- [ ] Executar testes de worker, incluindo reinício entre commit e finalização do job; confirmar PASS.
- [ ] Commit `feat: schedule durable backups and retention`.

## Task 4: Bloqueio, prévia e restauração

**Files:** criar apps/api/src/data-management/{data-preview.service.ts,data-confirmation.service.ts,restore.service.ts,maintenance-lock.service.ts}; criar migration com bloqueio de escrita nos modelos da organização, incluindo integrações; modificar prisma.service.ts apenas para suporte às transações internas autorizadas.

**Interfaces:** previewRestore(organizationId, backupId): Promise<OperationPreview>; confirm(principal, previewId, password, phrase): Promise<ConfirmedOperation>; RestoreService.execute(operationId): Promise<void>. Prévia expira em cinco minutos, nonce de uso único, atrelada a sessão, organização, checksum e fingerprint dos dados; frase RESTAURAR DADOS.

- [ ] Escrever restore.integration.spec.ts: senha/frase incorretas, prévia expirada ou alterada, rollback por FK inválida, falha da cópia preventiva, sessão revogada e usuário global compartilhado preservado.
- [ ] Rodar teste e confirmar falha.
- [ ] Implementar trava por organização coordenada no banco: escritas comuns adquirem trava compartilhada via triggers; operação de manutenção adquire exclusiva antes do snapshot preventivo. Somente rotina interna autorizada prossegue com manutenção, nunca parâmetros HTTP.
- [ ] Validar backup e capacidade, copiar estado atual e verificar, preparar dados e substituir em uma transação com auditoria de sucesso e checkpoint do job. Recuperar configurações e associações sem modificar usuários globais compartilhados; preservar credencial e associação do executor. Revogar sessões da organização após sucesso.
- [ ] Rodar testes de restauração, RLS e concorrência: escrita já iniciada conclui antes da cópia; nova escrita humana, integração e tarefa é bloqueada durante manutenção.
- [ ] Commit `feat: restore verified tenant backups atomically`.

## Task 5: Exclusão com dependências

**Files:** criar apps/api/src/data-management/{data-deletion.service.ts,attachment-cleanup.service.ts,data-deletion.integration.spec.ts}; estender registry e preview da Task 4.

**Interfaces:** previewDelete(organizationId, categories): Promise<OperationPreview>; DataDeletionService.execute(operationId): Promise<void>. Phrase APAGAR DADOS; dependências fazem parte da prévia e fingerprint.

- [ ] Escrever testes: categoria contato relacionado gera prévia explícita das dependências; tudo operacional preserva usuários, perfis, configurações e auditoria; contagem mudou exige reconfirmar; falha de backup não exclui dados.
- [ ] Rodar teste e confirmar falha.
- [ ] Implementar confirmação em duas etapas, reautenticação, cópia preventiva completa e transação com exclusão em ordem de FK. Usar registry explícito, sem SQL construído de categoria arbitrária. Não mostrar leads separado sem modelo próprio.
- [ ] Implementar remoção de anexos pós-commit com outbox idempotente quando existir armazenamento; falha é recuperável e visível. Separar logs operacionais de auditoria protegida.
- [ ] Rodar testes de exclusão e isolamento; confirmar PASS.
- [ ] Commit `feat: safely delete operational tenant data`.

## Task 6: Rotas, download e auditoria

**Files:** criar apps/api/src/data-management/{data-management.controller.ts,data-management.integration.spec.ts}; modificar audit.service.ts apenas se preciso para registro no mesmo transaction client.

**Interfaces:** /admin/data-management: GET backups, GET operations/:id, POST backups, GET backups/:id/download, DELETE backups/:id, GET/PUT schedule, POST restore/preview, POST delete/preview, POST operations/confirm. Confirmação retorna jobId para acompanhamento; comandos não executam exclusão diretamente no request.

- [ ] Escrever testes HTTP para todas as rotas com ADMIN, VIEWER, API key, sessão inválida e Superusuário; testar IDs de outra organização, download privado e redaction.
- [ ] Rodar teste e confirmar falha.
- [ ] Aplicar AuthenticationGuard e SuperuserGuard em toda a controller; validar DTOs Zod estritos, limits e rate limit na reautenticação. Auditoria registra IP confiável, evento, responsável, contagens e operação; senha nunca entra em payload persistido ou logs.
- [ ] Registrar início/falha/download/exclusão/agenda e acessos negados; audit success e alteração destrutiva pertencem à mesma transação. Falha de auditoria obrigatória aborta alteração.
- [ ] Reexecutar testes HTTP e audit-completeness.integration.spec.ts; confirmar PASS.
- [ ] Commit `feat: expose audited superuser data-management API`.

## Task 7: Administração no workspace

**Files:** criar apps/web/src/app/data-management/{data-management-panel.tsx,data-management-panel.test.tsx}; modificar apps/web/src/lib/api-client.ts, app/workspace/{workspace-provider.tsx,navigation.ts}, packages/contracts/src/workspace-preferences.ts e ponto de renderização de destinos existente.

**Interfaces:** painel consome contratos Task 2 e rotas Task 6; destino data-management exige isSuperuser e é agrupado em Administração.

- [ ] Ler guia instalado do Next.js indicado em AGENTS.md e escrever testes de visibilidade, histórico, agendamento, dupla confirmação, senha descartada e falha seguida de nova tentativa.
- [ ] Rodar `pnpm --filter @axes/web test`; confirmar falhas dos testes novos.
- [ ] Integrar painel ao estilo existente. Mostrar etapas reais e percentual apenas com denominador; polling termina em sucesso/falha e é descartado ao sair ou trocar organização. Mostrar organização, contagens, data e impacto antes da confirmação.
- [ ] Reexecutar testes e adicionar jornada Playwright com organização sintética: criar → modificar → restaurar → conferir → apagar operacional → conferir preservação.
- [ ] Commit `feat: add superuser backup and recovery workspace`.

## Task 8: Release de teste e recuperação

**Files:** criar docs/releases/CRM-backup-em-teste.md e docs/operations/crm-backup-recovery.md; atualizar CHANGELOG.md e exemplos de ambiente existentes.

- [ ] Documentar provisionamento/revogação de Superusuário, volume durável, gestão de chave, limites de backup, worker, retenção e recuperação da cópia preventiva em ambiente descartável.
- [ ] Preparar PostgreSQL descartável com migrações e papel APP sem BYPASSRLS; rodar `pnpm verify` e `pnpm test:e2e`. Corrigir falhas pertinentes e registrar comandos/resultados e bloqueios reais.
- [ ] Demonstrar restauração validada após reinício, isolamento entre duas organizações e arquivo sintético criptografado; não usar dados reais.
- [ ] Rever diff e critérios de toda a spec; nenhuma rota incompleta ou recurso fictício pode ser declarado pronto.
- [ ] Commit de documentação; publicar branch/release de teste no GitHub dentro da autorização do usuário. Só declarar entregue após checks aprovados; registrar limitações de infraestrutura se houver.

## Handoff

Plano revisado internamente contra a especificação. Aguardar revisão do usuário e escolha de execução: nativa nesta sessão ou com subagentes por tarefa. Recomendação: nativa, porque autorização, snapshot e recuperação compartilham contratos e precisam de integração sequencial.

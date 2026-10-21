# Restore Ticket / TicketEvent — especificação de implementação segura

**Checkpoint:** 21/10/2026. **Escopo:** preparação técnica; este documento não implementa nem libera restore.

## Evidência no código

- Registro `TENANT_DATA_REGISTRY`: `Ticket` e `TicketEvent` com exportação FULL e política REPLACE; `TicketProtocolCounter` usa `MERGE_HIGH_WATER`; `TicketSatisfactionSurvey` usa `RENEW_EXPIRED_TOKEN`.
- Executor `restore-executor.ts`: `RESTORE_MODELS` ainda não contém `Ticket` ou `TicketEvent`; `unsupportedRestoreModels` deve bloquear dados presentes no estado atual **ou** no snapshot alvo.
- A PR #265 protege essa rejeição com regressões unitárias; merge em `6d638391fde3a2a7c3bdbc282754011283e75880`.
- A política de integridade deve usar metadados reais de `BACKUP_SCHEMA`, não presumir nomes de colunas ou cardinalidades.

## Sequência recomendada (TDD, PRs pequenas)

### 1 — Inventário do grafo e provas RED
- [ ] Inspecionar metadados Prisma reais para FKs de `Ticket` e `TicketEvent`, incluindo dependências de `SupportQueue`, `SlaPolicy`, contatos, usuários e demais tabelas referenciadas; registrar campos, nulabilidade, ordem de deleção/reinserção e índices exclusivos.
- [ ] Testes PostgreSQL com role de aplicação restrita (NOSUPERUSER, NOBYPASSRLS): snapshot vazio, round-trip exato, eventos órfãos, referências inexistentes/de outro tenant, colisão de PK, rollback após falha tardia e microssegundos.
- [ ] Validar relações a estados com políticas especiais que **não** podem ser silenciosamente restaurados (contadores e satisfação). Rejeitar antes de qualquer mutação se a operação não suportar uma dependência.
- [ ] Registrar CI RED e critérios de correção, sem simular teste executado.

### 2 — Implementação protegida, apenas interna
- [ ] Adicionar `Ticket` e `TicketEvent` ao grafo parent-first **somente após** revisar FK closure e dependências com o estado preservado.
- [ ] Fazer `validateRestoreReferences` e `validateRestoreIdentityReferences` falharem fechados; validar referências cruzadas antes de exclusões.
- [ ] Usar `withMaintenance` + transação `RepeatableRead` ou `Serializable` conforme contrato atual; tenant fixado ao contexto RLS; DELETE em ordem inversa, INSERT parent-first.
- [ ] Não alterar schema ou regras de negócio fora do escopo; não publicar API, UI ou job acionável externamente.
- [ ] Provar via testes que todos os dados de outra organização permanecem intocados e que falhas geram rollback completo.

### 3 — CI, revisão e limite de release
- [ ] Prettier, lint, tipos, suites API/PostgreSQL, E2E, Docker Compose/build e `verify` no SHA exato.
- [ ] Após merge, exigir execução `push/main` e `source_manifest`; em PR esse job é `skipped` por definição do workflow.
- [ ] Vincular resultados e SHA ao PR e ao gate #250, sem confundir CI com homologação.
- [ ] Preservar bloqueios de produção: políticas especiais, cópia preventiva real, confirmação/auditoria e homologação #159.

## Fora de escopo desta preparação

Nenhum executor de Ticket/Event implementado aqui; nenhuma mutação em dados reais; nenhuma liberação de restauração operacional. A estratégia de `TicketProtocolCounter` e `TicketSatisfactionSurvey` exige implementação e testes próprios.

# CRM — antecipação técnica de quatro semanas (restore, segurança e RLS)

**Base:** `main` após PR #272, SHA `6483215e8b3c522488b267cedf8a5d681f3ec31e`.
**Escopo:** quatro blocos de trabalho do roadmap, não quatro semanas cronológicas.
**Situação:** evidência de código nesta branch; os resultados de CI, merge e
`push/main` precisam ser associados ao SHA efetivo antes de marcar concluído.

## Semana 1 — vinculação obrigatória do snapshot ao tenant

- Pré-validação `validateRestoreReferences` exige uma única raiz `Organization`
  e coleções exportadas disponíveis.
- Verifica explicitamente `organizationId` de todas as políticas com escopo
  `ORGANIZATION`, inclusive tabelas sem FK de negócio útil para a checagem.
- Exige `id` coerente na política `ORGANIZATION_ROOT`.
- Falha fechada com `BACKUP_REFERENCES_INVALID`, sem executar escrita.

**Provas:** snapshot sem raiz, raiz duplicada e registros fora do tenant
em Company, Ticket, TicketEvent, TicketSatisfactionSurvey e
TicketProtocolCounter.

## Semana 2 — fechamento de referências de atendimento

- Uma FK obrigatória com componente nulo ou ausente é inválida. Continua
  permitido omitir FK opcional conforme `MATCH SIMPLE` do PostgreSQL.
- Referências de Ticket, TicketEvent e TicketSatisfactionSurvey continuam
  verificadas com o grafo da versão de schema revisada, sem SQL dinâmico.
- A restauração de Ticket/TicketEvent continua **não implementada**: os testes
  são pré-requisitos, não autorização para adicionar modelos ao executor.

**Provas:** grafo completo, evento com ticket inválido, evento com autor ausente,
pesquisa de satisfação órfã e FK obrigatória nula.

## Semana 3 — isolamento multiempresa efetivo

- Teste de integração com PostgreSQL e `RLS_DATABASE_URL` (papel restrito).
- Registros de Ticket, TicketEvent, TicketSatisfactionSurvey e EmailOutbox
  criados para o tenant B precisam ser invisíveis ao tenant A.
- O tenant B deve continuar vendo os próprios registros pela mesma role de
  aplicação. Os dados de teste são sintéticos, sem e-mails reais.

**Provas:** duas consultas com `withTenant` e quatro tabelas sob RLS.

## Semana 4 — proteção de contexto de manutenção e gates de entrega

- Um executor chamado dentro de `withMaintenance(tenantA)` para restaurar
  `tenantB` deve falhar com `RESTORE_MAINTENANCE_REQUIRED`.
- Comparar dados das duas organizações antes/depois da rejeição.
- Registrar gate reprodutível com `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, testes API/PostgreSQL, E2E e build/Compose.
- Exigir **CI verde no SHA da PR**; após merge, conferir separadamente os jobs
  `verify` e `source_manifest` do evento `push/main`.

**Provas:** rejeição cruzada e ausência de mutação, logs e hashes de CI.

## Limites obrigatórios

- Esta antecipação não habilita restore HTTP, botão administrativo, job
  operacional, migração de schema, expurgo, alteração de políticas de retenção
  nem implantação em servidor.
- `Ticket` e `TicketEvent` seguem fora de `RESTORE_MODELS` até fechamento
  completo do grafo de FKs e das políticas especiais.
- `TicketProtocolCounter` usa `MERGE_HIGH_WATER` e
  `TicketSatisfactionSurvey` usa `RENEW_EXPIRED_TOKEN`; não tratar como
  `REPLACE`. `EmailOutbox` e segredos são preservados/excluídos do snapshot.
- Antes de permitir restore: cópia preventiva real e verificada, bloqueio
  exclusivo, confirmação anti-replay, auditoria atômica, rollback,
  homologação em ambiente real e aceites das issues #250 e #159.
- Sem evidência operacional assinada, o estado do release permanece **NO-GO**.

## Checklist de fechamento

- [ ] CI da branch sobre o HEAD exato: `verify` verde
- [ ] Código e regressões integrados à `main`
- [ ] CI `push/main` no SHA integrado: `verify` verde
- [ ] CI `push/main`: `source_manifest` verde e origem verificável
- [ ] Registrar no #250 o SHA final, os links das execuções e eventuais ressalvas
- [ ] Homologação operacional #159 **pendente** (não concluída por CI)

# F4.2 — Webhooks de saída — execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** completar a microentrega F4.2 já autorizada com administração visual, eventos transacionais e entrega HTTPS assinada, persistente e isolada por organização.

**Architecture:** a fila persistente funciona como outbox dentro da transação de negócio. Um worker da API processa a fila fora da transação, com lease e registro imutável das tentativas. A UI usa as permissões e a navegação existentes.

**Tech Stack:** NestJS, Prisma/PostgreSQL/RLS, Next.js, Zod, Jest/Vitest, Playwright, Compose.

**Spec:** `docs/superpowers/specs/2026-09-27-phase-4-integracoes-design.md`, F4.2; autonomia operacional no plano canônico `2026-09-27-phase-4-integracoes.md`.

## Global Constraints

- Branch a partir da main atual, TDD, revisão independente e gate integral antes de integrar.
- Todo acesso a dados de webhook usa `PrismaService.withTenant()`; RLS ENABLE/FORCE, FK composta e guard de manutenção nas tabelas novas.
- Somente `integration.manage` administra ou testa; `integration.read` lê configurações e histórico sem segredos.
- Segredo aleatório revelado apenas na criação; AES-256-GCM com `WEBHOOK_ENCRYPTION_KEY` de 32 bytes em base64 canônico. Sem chave configurada, criação falha fechada e worker não envia.
- Eventos iniciais: `company.created`, `opportunity.won`, `opportunity.lost`, `ticket.closed`. Corpo v1 limitado a identificadores, versão e data; nenhum nome, contato, descrição, valor ou token.
- HTTPS, porta 443, sem credenciais, query ou fragmento. Bloquear redes não públicas, DNS privado/misto, rebinding e redirecionamento; resolver a cada tentativa e fixar o IP aprovado na conexão mantendo hostname/TLS.
- Entrega pelo menos uma vez, com event ID estável; destinatário deduplica. Até 5 tentativas, backoff de 30s × 2^(tentativa anterior), timeout 5s e lease 30s.
- Sem persistir corpo de resposta; histórico com status HTTP e código de erro controlado. Nunca reprocessar DELIVERED.
- Configuração e fila não são exportadas nem restauradas por backup: preservar estado impede reativação/replay de integrações por restauração.

## Review Focus

1. DNS alterna entre IP público/privado ou usa IPv6 mapeado: nenhum acesso a rede interna; testes da Task 1.
2. Dois workers disputam a mesma fila ou processo morre após envio: lease/token e event ID preservam histórico e limite; testes da Task 2.
3. URL alterada/assinatura desativada com fila pendente: cancelar envios antigos antes de abrir conexão; testes da Task 2.
4. Operação de negócio falha depois de enfileirar: rollback remove evento e dados juntos; testes da Task 2.
5. UI navega/sai durante criação ou API falha: segredo limpo, falha verdadeira e edição com versão; testes da Task 3.

### Task 1: Contratos, armazenamento e gestão

**Files:** `packages/contracts/src/webhooks.ts`, `webhooks.test.ts`, `index.ts`; Prisma schema/migration; `apps/api/src/webhooks/{webhook-security,webhook-secret,webhook-transport,webhooks.service,webhooks.controller,webhooks.module}` e testes; environment/Compose/registry.

**Interfaces:**

- Contratos exportam `WebhookEventTypeSchema`, `WebhookSubscriptionCreateInputSchema`, `WebhookSubscriptionUpdateInputSchema`, `WebhookSubscriptionSummarySchema`, `WebhookSubscriptionCreatedSchema`, `WebhookDispatchSummarySchema` e tipos equivalentes.
- Criar: `{name,targetUrl,eventTypes}` → summary + `plainSecret`; editar: `{version,name?,targetUrl?,eventTypes?,isActive?}` → summary, com versão otimista.
- Endpoints `/integrations/webhooks`: GET array, POST criação; `/:id`: PATCH; `/:id/test`: POST → dispatch; `/:id/deliveries`: GET últimos 50 dispatches com tentativas.
- A Task 1 implementa GET/POST/PATCH e leitura do histórico; a Task 2 implementa o teste manual ao acrescentar o outbox.
- Model `WebhookSubscription`: org/name/target/eventTypes/encryptedSecret/active/version/creator/timestamps.
- Model `WebhookDispatch`: org/subscription/eventId/type/payload/target/encryptedSecret/status/attemptCount/nextAttemptAt/leaseToken/lockedUntil/requestId/timestamps.
- Model `WebhookDelivery`: resultado append-only por dispatch/tentativa, org/subscription/status/responseStatus/errorCode/createdAt. Unique `(dispatchId,attempt,organizationId)`.
- `WebhookTransport.send(targetUrl, body, headers)` → `{responseStatus:number|null,errorCode:string|null}`; exportar token DI para testes controlados.

- [ ] Escrever testes de contratos, SSRF/DNS/IP fixado/redirect/timeout, criptografia e gestão sem segredo na leitura, conflitos e RBAC/tenant.
- [ ] Observar RED funcional; testes PostgreSQL ficam explicitamente pendentes até CI se banco local ausente.
- [ ] Implementar os contratos, schema/migration e gestão; registrar auditoria segura; erros de rede retornam códigos controlados.
- [ ] Executar contratos, testes unitários de webhooks, environment, inventário e typecheck após Prisma generate. Esperado: GREEN.
- [ ] Commit com arquivos explícitos, sem saídas geradas não relacionadas.

### Task 2: Outbox e worker

**Files:** `webhook-outbox.ts`, `webhook-worker.ts`, `webhook-worker.runtime.ts`, testes; Companies/Opportunities/Tickets services e módulos.

**Interfaces:**

- `enqueueWebhookEvent(tenant, {organizationId,eventType,entityId,entityVersion,requestId,occurredAt?})`: grava dispatch por assinatura ativa na mesma transação existente. Payload `{id,type,version:1,occurredAt,organizationId,data:{entityId,version}}`.
- `WebhookWorker.processNext(organizationId, now?)`: claim atômico SKIP LOCKED e incremento de tentativas; transporte fora da transação; conclusão apenas com leaseToken atual, tentativa imutável e estado terminal/retry.
- `WebhookWorker.runCycle(now?)`: pagina organizações ativas; evita sobreposição no mesmo processo; um job por organização por ciclo para distribuir capacidade.
- Worker usa `WebhookTransport`, AES-GCM e funções de HMAC existentes. Header `X-Axes-Event-Id`, `X-Axes-Event-Type`, `X-Axes-Signature`, `X-Axes-Attempt`; assinatura sobre bytes exatos do JSON.
- Runtime roda somente com chave configurada, fora de NODE_ENV=test e com `WEBHOOK_WORKER_ENABLED=true`; polling `WEBHOOK_WORKER_POLL_MS=5000`, shutdown limpa timer.

- [ ] Escrever testes de persistência atômica, quatro gatilhos, não emissão em rollback/conflito, RLS real e FK cross-tenant.
- [ ] Escrever testes de worker com transporte controlado: assinatura verificável, sucesso, retry/esgotamento, lease concorrente/expirado, falha DNS, desativação/URL alterada e não reenvio de DELIVERED.
- [ ] Observar RED aplicável e implementar outbox/worker/runtime dentro das interfaces.
- [ ] Auditoria de esgotamento explicita `actorType=SYSTEM`/`actorId=webhook-worker` e requestId, sem payload/segredo.
- [ ] Executar unitários e regressão relevante; banco/RLS completos na CI. Esperado: GREEN sem ampliar privilégios.
- [ ] Commit.

### Task 3: Administração visual, E2E, documentação e integração

**Files:** `apps/web/src/app/admin/webhooks-view.tsx`, teste Home de webhooks, navegação/contratos de preferências/CSS; `tests/e2e/webhooks.spec.ts`, helper de navegação; guias e checkpoint.

**Interfaces:** consumir somente contratos/endpoints da Task 1. Destino `webhooks`, grupo Administração, rótulo Webhooks, permissão integration.read. UI trata segredo apenas em memória, limpa ao navegar/sair, impede nova criação enquanto revela segredo; edição inclui versão; histórico não contém payload/segredo.

- [ ] Escrever testes Web: leitura/gestão por permissão, criação/revelação/limpeza, editar/desativar, erro/conflito/retry, teste manual e histórico.
- [ ] Observar RED funcional; implementar UI com componentes/padrões existentes. Ler AGENTS/guia Next antes de editar.
- [ ] E2E real com organização isolada: criar assinatura, segredo único, editar, criar empresa e observar fila, teste manual e desativação. CI não envia a terceiros; worker testável por transporte controlado no teste de integração.
- [ ] Atualizar guia operacional, checkpoint e roadmap com estado preciso. Documentar geração da chave, DNS/HTTPS, assinatura e deduplicação, worker/retry e histórico limitado.
- [ ] Executar regressão Web/contratos, lint/types/format/build; revisão independente do diff inteiro.
- [ ] Publicar PR Draft pela conexão GitHub autorizada; CI integral precisa passar PostgreSQL, E2E, Compose e imagens. Registrar SHA/run; Ready e merge conforme autorização de continuidade.

# Fase 4 — Integrações — Design Canônico

Data de autorização: 27/09/2026

## Contexto

A Fase 1 — MVP Comercial, a Fase 2 — Produtividade e a Fase 3 — Atendimento estão fechadas em `main`, todas com quality gate verde (lint, typecheck, testes de integração reais contra PostgreSQL, E2E e build de imagens Docker).

O CRM hoje é um sistema fechado: tudo que entra e sai dele passa pela UI e pela API interna consumida pelo próprio frontend. A Fase 4 abre esse sistema para o mundo externo, preservando a arquitetura homologada:

- Next.js;
- NestJS;
- Prisma;
- PostgreSQL;
- Docker Compose;
- autenticação e sessão existentes;
- RBAC explícito;
- PostgreSQL RLS com `FORCE ROW LEVEL SECURITY`;
- auditoria append-only;
- TDD, E2E e quality gate antes de integração.

A Fase 4 não substitui nenhum domínio existente (Empresas, Contatos, Atividades, Oportunidades, Territórios, Atendimento). Ela adiciona uma camada de integração que expõe e recebe dados desses domínios através de canais externos.

## Objetivo

Entregar um conjunto de integrações multiempresa que permita ao CRM:

1. ser consumido por sistemas de terceiros via API com autenticação própria (sem depender da sessão JWT do usuário);
2. notificar sistemas externos quando eventos de negócio relevantes ocorrem (webhooks de saída);
3. enviar e receber e-mail transacional vinculado a Contatos/Solicitações;
4. enviar e receber mensagens via WhatsApp Business vinculadas a Contatos/Solicitações;
5. registrar eventos de telefonia (chamadas) vinculados a Contatos/Atividades/Solicitações;
6. sincronizar Empresas e Produtos com um ERP externo.

O resultado esperado é permitir que o CRM deixe de ser uma ilha e passe a operar como o centro de um ecossistema de atendimento e vendas multicanal, sem abrir mão do isolamento multiempresa que é o contrato de segurança mais importante do produto.

## Regra de nomenclatura

Seguindo o precedente aberto na Fase 3, as entregas desta fase usam o prefixo **F4.x** até que o versionamento canônico do produto seja normalizado. Documentos históricos `CYCLE_5_*`/`CYCLE_6_*` não representam necessariamente código integrado na linha canônica atual.

## Arquitetura funcional

```text
Sistemas externos                         CRM (domínios existentes)
┌─────────────────┐                       ┌───────────────────────────┐
│ Terceiro (API)   │──── API Key ────────▶│ Empresas / Contatos        │
│ ERP              │◀─── Webhook ─────────│ Oportunidades / Atividades │
│ Provedor e-mail  │──── Inbound hook ────▶│ Solicitações (Atendimento) │
│ WhatsApp (Meta)  │◀──── Outbound send ───│                           │
│ PABX/CTI         │──── Call event ──────▶│                           │
└─────────────────┘                       └───────────────────────────┘
        ▲                                              │
        │                                              ▼
        └──────────────── Integration Layer (F4.x) ────┘
             IntegrationCredential · WebhookSubscription
             WebhookDelivery · InboundMessage · CallEvent
             ErpSyncJob
```

A camada de integração é um conjunto de módulos novos (`integrations`, `webhooks`, `messaging`, `telephony`, `erp-sync`) que lêem e escrevem nos domínios existentes através dos services já homologados (nunca via SQL direto), e adicionam suas próprias entidades de controle (credenciais, assinaturas, entregas, eventos brutos recebidos).

## Agregados principais

### `IntegrationCredential` (API Key de terceiros)

Substitui a sessão JWT de usuário para consumo máquina-a-máquina.

Campos mínimos:

- `id`: UUID;
- `organizationId`: tenant obrigatório;
- `name`: identificação legível (ex.: "ERP Protheus — produção");
- `keyHash`: hash da chave (nunca armazenada em texto puro, mesmo padrão de `passwordHash`);
- `keyPrefix`: prefixo curto exibido na UI para identificação sem expor a chave inteira;
- `scopes`: lista de permissões concedidas (subconjunto de `Permission`, nunca superior ao papel de quem criou a chave);
- `isActive`;
- `lastUsedAt`;
- `expiresAt`: opcional;
- `createdAt`, `createdBy`, `revokedAt`, `revokedBy`.

A chave é exibida uma única vez na criação. Requisições autenticadas por API Key operam sob o mesmo `withTenant()`/RLS que uma sessão de usuário — a integração nunca ganha um caminho de acesso privilegiado que ignore o isolamento por tenant.

### `WebhookSubscription`

- `id`, `organizationId`;
- `targetUrl`: HTTPS obrigatório;
- `eventTypes`: lista de eventos assinados (ex.: `opportunity.won`, `ticket.closed`, `company.created`);
- `secret`: usado para assinatura HMAC do payload (nunca reenviado em claro após a criação);
- `isActive`;
- `createdBy`, `createdAt`.

### `WebhookDelivery`

Registro append-only de cada tentativa de entrega — não é editável, só criado.

- `id`, `organizationId`, `subscriptionId`;
- `eventType`, `payload` (snapshot no momento do disparo);
- `attempt`, `status` (`PENDING`, `DELIVERED`, `FAILED`, `EXHAUSTED`);
- `responseStatus`, `responseSnippet` (truncado, nunca corpo completo por questão de armazenamento);
- `deliveredAt`, `nextRetryAt`.

### `InboundMessage` (WhatsApp e e-mail)

Modelo comum para mensagens recebidas por canais externos antes de serem vinculadas a um Contato/Solicitação.

- `id`, `organizationId`;
- `channel` (`WHATSAPP`, `EMAIL`);
- `externalId`: identificador da mensagem no provedor, único por canal (idempotência);
- `fromAddress`, `rawPayload`;
- `contactId`, `ticketId`: opcionais, preenchidos após triagem;
- `receivedAt`, `processedAt`.

### `CallEvent`

- `id`, `organizationId`;
- `direction` (`INBOUND`, `OUTBOUND`);
- `contactId`: opcional (nem toda chamada identifica o contato de imediato);
- `externalCallId`: identificador do PABX/CTI, único (idempotência);
- `startedAt`, `answeredAt`, `endedAt`, `durationSeconds`;
- `recordingUrl`: opcional;
- `activityId`: vínculo opcional com uma `Activity` gerada a partir da chamada.

### `ErpSyncJob`

- `id`, `organizationId`;
- `direction` (`IMPORT`, `EXPORT`);
- `entity` (`COMPANY`, `PRODUCT`);
- `status` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`);
- `startedAt`, `finishedAt`, `summary` (contagem de criados/atualizados/rejeitados), `errorDetail`.

## Segurança multiempresa

Todos os novos dados da Fase 4 devem:

- possuir `organizationId`;
- operar dentro de `PrismaService.withTenant()`;
- utilizar RLS com `ENABLE`/`FORCE ROW LEVEL SECURITY`;
- falhar de forma fechada sem contexto tenant;
- impedir referência cross-tenant no serviço e por constraints compostas no banco (mesmo padrão de `(id, organizationId)` já usado em Territory e Tickets).

Riscos específicos desta fase, adicionais aos já cobertos pelo padrão RLS:

- **API Key não pode escalar privilégio**: os `scopes` de uma chave nunca podem exceder as permissões do usuário que a criou no momento da criação; revalidar isso na criação e periodicamente, não só uma vez.
- **Webhook de saída não pode vazar segredo**: o `secret` de assinatura nunca é retornado em nenhuma resposta de leitura após a criação (mesmo padrão de "mostrar uma vez" da API Key).
- **Webhook de saída não pode ser usado para SSRF**: `targetUrl` deve ser validada contra IPs privados/loopback/metadata endpoints (ex.: `169.254.169.254`) antes de qualquer disparo.
- **Endpoint de recebimento (WhatsApp/e-mail/CTI) é público por natureza**: precisa de verificação de assinatura/token do provedor (cada canal tem seu próprio mecanismo — ex.: verificação de webhook da Meta) antes de aceitar qualquer payload como legítimo, e precisa resolver o tenant a partir de um identificador de configuração (ex.: número de WhatsApp, caixa de e-mail), nunca a partir de um campo livre do payload.
- **Idempotência é obrigatória** em todo canal de entrada (`externalId`/`externalCallId` únicos), porque provedores externos reenviam eventos.

## RBAC

Permissões propostas, adicionadas apenas nas microentregas que as consumirem:

- `integration.manage` (criar/revogar API Keys e assinaturas de webhook);
- `integration.read` (ver credenciais mascaradas, assinaturas e histórico de entregas, sem gerenciar);
- `messaging.read` / `messaging.write` (mensagens de WhatsApp/e-mail vinculadas a contato/solicitação);
- `telephony.read` (eventos de chamada);
- `erp_sync.manage` (disparar e acompanhar sincronizações).

Nenhum novo papel fixo será criado. A matriz existente (`ADMIN`/`MANAGER`/`SELLER`/`VIEWER`) será evoluída de forma compatível — por padrão, gestão de integrações é `ADMIN`-only, dado o risco de exfiltração de dados que uma credencial ou webhook mal configurado representa.

## Auditoria

Eventos mínimos esperados ao longo da fase:

- `integration.credential.created` / `.revoked`;
- `integration.webhook_subscription.created` / `.updated` / `.deleted`;
- `integration.webhook_delivery.failed` (após esgotar tentativas);
- `messaging.inbound_received` / `.linked_to_contact`;
- `messaging.outbound_sent`;
- `telephony.call_logged`;
- `erp_sync.started` / `.completed` / `.failed`.

Eventos mantêm ator (quando houver — entregas automáticas de sistema usam um ator técnico identificável, nunca `null` silencioso), requestId, entidade, before/after seguro e tenant.

## Concorrência e integridade

Filas de entrega (webhook) e sincronização (ERP) são processadas de forma assíncrona. O estado (`status`, `attempt`, `nextRetryAt`) é atualizado por transação, e um job nunca reprocessa uma entrega já marcada `DELIVERED` (checagem antes de executar, não só antes de agendar).

## UX

A primeira UX é administrativa e operacional:

- tela de credenciais de API (criar, revogar, ver `lastUsedAt`);
- tela de assinaturas de webhook (criar, testar disparo manual, ver histórico de entregas e motivo de falha);
- painel de mensagens de WhatsApp/e-mail vinculado à Solicitação/Contato (thread simples, sem editor de campanha);
- indicador de chamada recente no Contato;
- tela de sincronizações de ERP (disparar manualmente, ver status e erros).

Automação visual, workflow builder e campanhas de disparo em massa não são requisitos iniciais — isso é Fase 5.

## Microentregas

### F4.1 — Fundação de Credenciais e API Pública

- `IntegrationCredential`: schema, migration, RLS, hash/prefixo de chave;
- guard de autenticação por API Key (paralelo ao guard JWT existente, mesmo pipeline de RBAC);
- validação de escopo não superior ao do criador;
- endpoints existentes (Companies, Contacts, Opportunities) acessíveis via API Key com os mesmos `scopes`/permissões já mapeados;
- testes adversariais: chave de uma org não acessa dados de outra; chave revogada é rejeitada imediatamente.

### F4.2 — Webhooks de Saída

- `WebhookSubscription`, `WebhookDelivery`: schema, migration, RLS;
- validação de `targetUrl` contra SSRF;
- disparo assinado (HMAC) nos eventos de domínio já existentes (começar por `opportunity.won/lost`, `ticket.closed`, `company.created`);
- fila de entrega com retry exponencial e limite de tentativas;
- UI de gestão e histórico de entregas.

### F4.3 — E-mail Transacional

- envio de e-mail de notificação (ex.: SLA próximo do vencimento, satisfação pós-atendimento) via provedor configurável (abstração de provider, sem acoplar a um fornecedor específico);
- recebimento de e-mail (`InboundMessage` com `channel=EMAIL`), triagem manual para vincular a Contato/Solicitação existente ou criar nova Solicitação.

### F4.4 — WhatsApp Business

- envio de mensagem vinculada a Contato/Solicitação;
- webhook de recebimento (verificação de assinatura do provedor), populando `InboundMessage` com `channel=WHATSAPP`;
- resolução de tenant pelo número de WhatsApp configurado por organização;
- consentimento/opt-in registrado por Contato antes de envio ativo.

### F4.5 — Telefonia/CTI

- `CallEvent`: schema, migration, RLS;
- endpoint de recebimento de eventos de chamada do PABX/CTI (idempotente por `externalCallId`);
- geração opcional de `Activity` a partir do evento de chamada;
- indicador de chamada recente na tela de Contato.

### F4.6 — Sincronização com ERP

- `ErpSyncJob`: schema, migration, RLS;
- importação de Empresas/Produtos a partir de um extrato do ERP (reaproveitando o parser de CSV já homologado em C4.2/C4.3.2 como primeira estratégia de transporte, antes de qualquer API direta);
- exportação (marcação de quais Empresas/Produtos already sincronizados, com resumo de divergências);
- UI de disparo manual e acompanhamento de status.

### F4.7 — Observabilidade, E2E e Release

- painel consolidado de saúde das integrações (última entrega de webhook, última sincronização ERP, taxa de falha);
- cobertura E2E dos fluxos administrativos (criar credencial, criar assinatura, disparo manual);
- regressão de segurança multi-tenant específica desta fase;
- documentação operacional (como configurar cada canal);
- checkpoint/release da Fase 4.

## Métricas iniciais

A fase deve preparar dados para:

- webhooks entregues vs. falhados, por assinatura;
- tempo médio de entrega de webhook;
- mensagens recebidas por canal (WhatsApp/e-mail);
- chamadas registradas por período;
- sincronizações de ERP por status.

Os relatórios visuais serão adicionados apenas quando os dados correspondentes existirem de forma canônica — mesma regra da Fase 3.

## Fora do escopo da Fase 4

- motor genérico de regras/automação (Fase 5);
- workflow visual (Fase 5);
- distribuição automática de leads/tickets por regra (Fase 5);
- chatbot (Fase 6);
- IA/RAG, classificação automática, scoring, recomendação (Fase 6);
- campanhas de disparo em massa via WhatsApp/e-mail;
- gravação/transcrição de chamada com IA;
- portal de autoatendimento do cliente além da página pública de satisfação já existente (C5.4).

Esses itens permanecem para as Fases 5 e 6 ou para uma decisão explícita futura de ampliar o escopo.

## Critérios de aceite da Fase 4

1. Toda integração opera dentro do isolamento por tenant já homologado — nenhuma credencial, webhook ou canal de entrada consegue ler ou escrever dados de outra organização.
2. API Keys nunca excedem o escopo de permissão de quem as criou, e são revogáveis imediatamente.
3. Segredos (chave de API, secret de webhook) nunca são expostos após a criação.
4. `targetUrl` de webhook é validada contra SSRF antes do primeiro disparo e a cada alteração.
5. Todo canal de entrada (WhatsApp, e-mail, CTI) verifica a autenticidade do provedor antes de processar qualquer payload.
6. Todo canal de entrada é idempotente por identificador externo único.
7. Mutações relevantes geram auditoria com ator, tenant e requestId.
8. UI respeita as mesmas permissões da API.
9. Quality gate, E2E, Compose e build das imagens permanecem GREEN.
10. Nenhum merge na `main` ocorre sem gate técnico verde e gate humano do responsável.

# Fase 4 — Integrações — Plano de Implementação

**Goal:** abrir o CRM Axesistemas para consumo e alimentação por sistemas externos (API pública por chave, webhooks, e-mail, WhatsApp Business, telefonia/CTI e ERP), preservando o isolamento multi-tenant homologado nas Fases 1–3.

**Arquitetura:** a Fase 4 adiciona módulos novos (`integrations`, `webhooks`, `messaging`, `telephony`, `erp-sync`) que operam sobre os domínios já existentes através dos services homologados, e adicionam suas próprias entidades de controle. Nenhum domínio existente é reescrito.

**Stack canônica:** Node 24.x, pnpm, TypeScript, Zod, NestJS, Prisma/PostgreSQL, Next.js/React, Vitest/Jest conforme pacote, Playwright, Docker Compose e GitHub Actions.

**Design:** `docs/superpowers/specs/2026-09-27-phase-4-integracoes-design.md`

## Autonomia operacional autorizada

A Fase 4 pode avançar em microentregas, respeitando:

- uma branch por microentrega ou bloco coerente;
- TDD sempre que houver comportamento novo;
- RED funcional observado antes do GREEN quando aplicável;
- revisão de segurança multi-tenant **e** de segurança de integração externa (SSRF, verificação de assinatura de provedor, idempotência) — esta fase tem superfície de ataque adicional às Fases 1–3, por lidar com endpoints públicos e credenciais de máquina-a-máquina;
- documentação e checkpoint;
- PR Draft durante desenvolvimento;
- gate integral antes de Ready for review;
- nenhuma integração automática na `main` sem gate verde;
- merge final preserva gate humano do responsável;
- não antecipar Fase 5 ou 6.

## Regra de execução

Para cada microentrega:

1. ler estado atual da `main`;
2. criar branch a partir da `main` atual;
3. escrever/ajustar spec quando necessário;
4. escrever teste RED;
5. observar falha esperada;
6. implementar mínimo necessário;
7. executar testes direcionados;
8. executar regressão relevante (incluindo os testes adversariais de tenant já existentes);
9. atualizar checkpoint;
10. executar quality gate;
11. abrir/atualizar PR Draft;
12. somente após GREEN, marcar Ready for review.

---

## F4.1 — Fundação de Credenciais e API Pública

### Objetivo

Permitir que um sistema externo autentique requisições à API existente por meio de uma chave própria da organização, sem depender de sessão de usuário.

### Entregáveis

- model `IntegrationCredential` (chave com hash + prefixo, escopos, expiração, revogação);
- migration com RLS (`ENABLE`/`FORCE`) e constraint composta `(id, organizationId)`;
- guard de autenticação por API Key, plugável ao lado do guard JWT já existente, reaproveitando `PermissionsGuard`;
- validação de escopo: nunca superior às permissões de quem criou a chave;
- exposição da chave em texto puro só na resposta de criação;
- endpoints de Companies/Contacts/Opportunities aceitando API Key com os `scopes` equivalentes.

### Regras

- `organizationId` nunca vem do payload nem do header — vem exclusivamente da credencial resolvida no guard;
- chave revogada é rejeitada imediatamente (sem cache de validade);
- `lastUsedAt` é atualizado de forma assíncrona, sem bloquear a requisição.

### Gate

- Prisma generate;
- migration em banco vazio;
- teste com role sem `BYPASSRLS` confirmando isolamento;
- teste adversarial: chave da Org A não lê/escreve dados da Org B;
- teste adversarial: escopo da chave não pode ser maior que o do criador.

---

## F4.2 — Webhooks de Saída

### Objetivo

Notificar sistemas externos quando eventos de negócio relevantes ocorrem, com entrega assinada e confiável.

### Entregáveis

- models `WebhookSubscription` e `WebhookDelivery` (append-only), migration, RLS;
- validação de `targetUrl` contra SSRF (bloquear loopback, redes privadas, endpoints de metadata de nuvem);
- assinatura HMAC do payload com o `secret` da assinatura;
- disparo nos eventos: `opportunity.won`, `opportunity.lost`, `ticket.closed`, `company.created` (primeiro lote — outros eventos entram sob demanda);
- fila de entrega com retry exponencial e limite de tentativas, marcando `EXHAUSTED` ao esgotar;
- UI: criar/editar/desativar assinatura, disparo manual de teste, histórico de entregas com motivo de falha.

### Regras

- `secret` nunca é retornado em nenhuma leitura após a criação;
- `targetUrl` é revalidada a cada alteração da assinatura, não só na criação;
- uma entrega já `DELIVERED` nunca é reprocessada.

### Gate

- teste adversarial de SSRF (URLs apontando para `127.0.0.1`, `169.254.169.254`, ranges privados são rejeitadas);
- teste de assinatura HMAC verificável pelo destinatário;
- teste de retry/backoff e de esgotamento de tentativas.

---

## F4.3 — E-mail Transacional

### Objetivo

Enviar notificações operacionais por e-mail e permitir o recebimento de e-mails vinculáveis a Contato/Solicitação.

### Entregáveis

- abstração de provedor de envio (interface única, sem acoplar a um fornecedor específico);
- gatilhos iniciais: alerta de SLA próximo do vencimento, pesquisa de satisfação (reaproveitando o link já existente da C5.4);
- model `InboundMessage` (`channel=EMAIL`) para recebimento, com `externalId` único por idempotência;
- fluxo de triagem manual: vincular a Contato/Solicitação existente ou abrir nova Solicitação.

### Regras

- e-mail recebido nunca cria dado antes da triagem confirmar o tenant/contato — fica em `InboundMessage` até ser processado;
- reenvio do mesmo `externalId` pelo provedor não duplica o registro.

### Gate

- teste de idempotência de recebimento;
- teste de que o envio falho não trava o fluxo que o disparou (ex.: fechamento de ticket não falha se o e-mail de satisfação falhar ao enviar).

---

## F4.4 — WhatsApp Business

### Objetivo

Enviar e receber mensagens de WhatsApp vinculadas a Contato/Solicitação, respeitando consentimento.

### Entregáveis

- endpoint de recebimento com verificação de assinatura do provedor;
- resolução de tenant pelo número de WhatsApp configurado por organização (não pelo payload);
- `InboundMessage` (`channel=WHATSAPP`);
- envio de mensagem ativa vinculado a Contato/Solicitação;
- registro de opt-in/consentimento por Contato, checado antes de qualquer envio ativo.

### Regras

- payload sem assinatura válida é rejeitado antes de qualquer processamento;
- envio ativo sem opt-in registrado é bloqueado no service, não só na UI.

### Gate

- teste de rejeição de payload com assinatura inválida/ausente;
- teste de bloqueio de envio sem opt-in;
- teste de idempotência por `externalId`.

---

## F4.5 — Telefonia/CTI

### Objetivo

Registrar eventos de chamada (PABX/CTI) vinculados a Contato, com geração opcional de Atividade.

### Entregáveis

- model `CallEvent`, migration, RLS;
- endpoint de recebimento idempotente por `externalCallId`;
- vínculo opcional com `Activity` existente;
- indicador de chamada recente na tela de Contato.

### Gate

- teste de idempotência por `externalCallId`;
- teste de isolamento por tenant do evento de chamada.

---

## F4.6 — Sincronização com ERP

### Objetivo

Sincronizar Empresas e Produtos com um ERP externo, começando pelo transporte já homologado (CSV) antes de qualquer API direta.

### Entregáveis

- model `ErpSyncJob`, migration, RLS;
- importação reaproveitando o parser de CSV de C4.2/C4.3.2;
- exportação com marcação de sincronização e resumo de divergências;
- UI de disparo manual e acompanhamento de status.

### Gate

- teste de idempotência de importação (reimportar o mesmo extrato não duplica registros);
- teste de isolamento por tenant do job de sincronização.

---

## F4.7 — Observabilidade, E2E e Release

### Objetivo

Consolidar visibilidade operacional sobre as integrações e fechar a fase com o mesmo rigor das Fases 2 e 3.

### Entregáveis

- painel de saúde das integrações (últimas entregas, taxa de falha, últimas sincronizações);
- cobertura E2E dos fluxos administrativos;
- regressão de segurança multi-tenant específica desta fase;
- documentação operacional de configuração por canal;
- checkpoint/release da Fase 4.

### Gate

- quality gate completo (lint, typecheck, testes de integração reais, E2E, Compose, build de imagens) — mesmo padrão usado no fechamento das Fases 2 e 3;
- nenhum merge na `main` sem gate técnico verde e aprovação humana.

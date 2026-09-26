# Fase 3 — Atendimento — Plano de Implementação

**Goal:** evoluir o CRM Axesistemas para suportar solicitações de atendimento, protocolo, histórico, filas, SLA e satisfação, preservando a base multi-tenant homologada.

**Arquitetura:** a Fase 3 adiciona o agregado `ServiceRequest` e módulos dependentes sem duplicar Empresa, Contato, Activity ou Opportunity. Todo novo dado é tenant-aware, protegido por PostgreSQL RLS e operado por NestJS/Prisma dentro do contexto autenticado.

**Stack canônica:** Node 24.x, pnpm, TypeScript, Zod, NestJS, Prisma/PostgreSQL, Next.js/React, Vitest/Jest conforme pacote, Playwright, Docker Compose e GitHub Actions.

**Design:** `docs/superpowers/specs/2026-09-24-phase-3-atendimento-design.md`

## Autonomia operacional autorizada

A Fase 3 pode avançar autonomamente em microentregas, respeitando:

- uma branch por microentrega ou bloco coerente;
- TDD sempre que houver comportamento novo;
- RED funcional observado antes do GREEN quando aplicável;
- revisão de segurança multi-tenant;
- documentação e checkpoint;
- PR Draft durante desenvolvimento;
- gate integral antes de Ready for review;
- nenhuma integração automática na `main` sem gate verde;
- merge final preserva gate humano do responsável;
- não antecipar Fases 4, 5 ou 6.

## Regra de execução

Para cada microentrega:

1. ler estado atual da `main`;
2. criar branch a partir da `main` atual;
3. escrever/ajustar spec quando necessário;
4. escrever teste RED;
5. observar falha esperada;
6. implementar mínimo necessário;
7. executar testes direcionados;
8. executar regressão relevante;
9. atualizar checkpoint;
10. executar quality gate;
11. abrir/atualizar PR Draft;
12. somente após GREEN, marcar Ready for review.

---

## F3.1 — Fundação Solicitação/Protocolo

### Objetivo

Criar o domínio persistente mínimo de Solicitação de Atendimento, sem API pública de escrita nesta primeira fatia se o TDD exigir separação de risco.

### Entregáveis

- `ServiceRequestStatus`;
- `ServiceRequestPriority`;
- model `ServiceRequest`;
- relações tenant-aware com Organization, Company, Contact e User;
- protocolo imutável;
- versionamento;
- soft delete conforme padrão do CRM;
- índices;
- migration PostgreSQL;
- `ENABLE/FORCE RLS`;
- policy fail-closed;
- testes adversariais de isolamento.

### Regras

- pelo menos Empresa ou Contato deve identificar o cliente;
- referências devem ser do tenant atual;
- `organizationId` nunca vem do payload;
- protocolo não vem do payload;
- protocolo é único;
- prioridade e status usam enums canônicos;
- solicitações de outro tenant não são visíveis.

### Gate

- Prisma generate;
- migration em banco vazio;
- teste com role sem `BYPASSRLS`;
- fail-closed sem tenant;
- isolamento entre dois tenants;
- format/lint/typecheck/build.

---

## F3.2 — API de Solicitações

### Endpoints alvo

- `GET /api/v1/service-requests`;
- `GET /api/v1/service-requests/:id`;
- `POST /api/v1/service-requests`;
- `PATCH /api/v1/service-requests/:id`;
- `PATCH /api/v1/service-requests/:id/status`;
- `PATCH /api/v1/service-requests/:id/assignment`;
- `DELETE /api/v1/service-requests/:id` somente se o comportamento de soft delete for aprovado no contrato final.

### Contratos

Lista deverá preparar filtros por:

- texto/protocolo;
- status;
- prioridade;
- empresa;
- contato;
- responsável;
- período de abertura.

### Segurança

- `service_request.read`;
- `service_request.write`;
- `service_request.assign`;
- `service_request.close`.

### Concorrência

PATCHes mutáveis usam `version`; versão stale retorna 409.

### Auditoria

Cobrir criação, alteração, atribuição, status, resolução, fechamento e cancelamento.

---

## F3.3 — Interações e Timeline

### Objetivo

Criar histórico operacional próprio da solicitação sem reutilizar indevidamente RelationshipEntry.

### Entregáveis

- `ServiceRequestInteraction`;
- contrato de criação;
- listagem cronológica;
- nota interna;
- registro manual de contato;
- vínculo ao ator;
- auditabilidade;
- RLS.

### Restrições

- sem WhatsApp automático;
- sem e-mail automático;
- sem CTI;
- sem alteração retroativa silenciosa de interação já registrada.

---

## F3.4 — Filas de Atendimento

### Entregáveis

- `ServiceQueue`;
- ativação/inativação;
- vínculo da solicitação a uma fila;
- atribuição manual;
- mudança de fila;
- filtros;
- auditoria;
- permissão `service_queue.manage`.

### Fora do incremento inicial

- skill-based routing;
- distribuição automática avançada;
- round-robin persistente;
- IA de roteamento.

---

## F3.5 — SLA

### Entregáveis

- `SlaPolicy`;
- regras mínimas de aplicação;
- snapshot de SLA na solicitação;
- primeira resposta;
- resolução;
- timestamps de meta;
- cumprimento/violação;
- permissão `service_sla.manage`.

### Regras

- política alterada não muda snapshot histórico;
- cálculo deve usar timestamps canônicos;
- pausa de SLA só entra após regra de negócio explícita e testes;
- calendário de feriados pode ser extensão futura, não requisito inicial.

---

## F3.6 — Web de Atendimento

### Navegação

Adicionar seção **Atendimento** ao shell somente com `service_request.read`.

### Telas

- lista;
- criação;
- detalhe;
- timeline;
- status;
- prioridade;
- responsável;
- fila;
- indicadores de SLA quando disponíveis.

### UX

Priorizar lista operacional e detalhe legível. Kanban não é requisito desta fase inicial.

---

## F3.7 — Satisfação

### Entregáveis

- `ServiceRequestSatisfaction`;
- nota 1–5;
- comentário opcional;
- unicidade por solicitação;
- leitura protegida por `service_satisfaction.read`;
- agregados básicos.

### Fora do escopo

- envio automático de pesquisa;
- link por WhatsApp/e-mail;
- NPS externo;
- IA de sentimento.

---

## F3.8 — Consolidação e Release

### Entregáveis

- E2E de jornada de atendimento;
- teste adversarial cross-tenant;
- relatório de permissões;
- métricas operacionais;
- manual operacional;
- rollback;
- checkpoint final;
- atualização do roadmap;
- registro da release da Fase 3.

### Jornada E2E mínima

1. autenticar;
2. criar Empresa/Contato ou usar fixture canônica;
3. abrir solicitação;
4. confirmar protocolo;
5. atribuir responsável/fila;
6. registrar interação;
7. mudar status;
8. aplicar/consultar SLA;
9. resolver/fechar;
10. registrar satisfação;
11. recarregar;
12. confirmar persistência e histórico.

## Ordem obrigatória

```text
F3.1 Fundação
  ↓
F3.2 API
  ↓
F3.3 Interações
  ↓
F3.4 Filas
  ↓
F3.5 SLA
  ↓
F3.6 Web
  ↓
F3.7 Satisfação
  ↓
F3.8 Release
```

Exceção: partes Web podem começar em paralelo somente quando o contrato/API consumido estiver estável e coberto.

## Critério para avanço automático

Pode avançar para a próxima microentrega quando:

- testes direcionados estão GREEN;
- regressão relevante está GREEN;
- não existe falha de segurança;
- não existe migration inconsistente;
- checkpoint está atualizado;
- o próximo item não depende de decisão de produto não documentada.

Quando houver decisão de produto realmente ambígua, adotar a opção mais conservadora, registrar a decisão provisória e evitar ampliar escopo.

## Não implementar automaticamente

- integrações externas;
- automação genérica;
- IA;
- novos canais;
- billing;
- multi-produto;
- refatorações grandes não necessárias à Fase 3;
- alteração de arquitetura base sem ADR específico.

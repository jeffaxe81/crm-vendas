# Fase 3 — Atendimento — Design Canônico

Data de autorização: 24/09/2026

## Contexto

A Fase 1 — MVP Comercial foi fechada em 11/09/2026. A Fase 2 — Produtividade evoluiu sobre a mesma base multiempresa e adicionou agenda, resumo gerencial e importação sem quebrar os contratos canônicos de segurança.

A Fase 3 amplia o CRM para um domínio de atendimento ao cliente, preservando a arquitetura homologada do projeto:

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

A Fase 3 não substitui Empresas, Contatos, Atividades ou Oportunidades. Ela adiciona um novo agregado de negócio para solicitações de atendimento e se relaciona com os domínios já existentes.

## Objetivo

Entregar um módulo de Atendimento multiempresa capaz de registrar, protocolar, classificar, encaminhar, acompanhar e encerrar solicitações com rastreabilidade completa, filas, SLA e satisfação.

O resultado esperado é permitir que o CRM evolua de uma ferramenta exclusivamente comercial para uma plataforma de relacionamento e atendimento.

## Regra de nomenclatura

Existem documentos históricos no repositório usando nomes `CYCLE_5_*` e `CYCLE_6_*` que não representam, necessariamente, código integrado na linha canônica atual.

Para evitar colisão de significado, as novas entregas desta fase usarão o prefixo **F3.x** até que o versionamento canônico do produto seja normalizado.

## Arquitetura funcional

```text
Empresa / Contato
       │
       ├── Oportunidades
       ├── Atividades
       │
       └── Solicitações de Atendimento
                  │
                  ├── Protocolo
                  ├── Prioridade
                  ├── Status
                  ├── Responsável
                  ├── Fila
                  ├── Interações
                  ├── SLA
                  ├── Histórico/Auditoria
                  └── Satisfação
```

## Agregado principal: ServiceRequest

A entidade canônica da Fase 3 será `ServiceRequest`, apresentada ao usuário como **Solicitação de Atendimento**.

### Campos mínimos

- `id`: UUID;
- `organizationId`: tenant obrigatório;
- `protocol`: protocolo imutável, gerado no servidor;
- `subject`: assunto;
- `description`: descrição inicial;
- `status`;
- `priority`;
- `companyId`: opcional;
- `contactId`: opcional;
- `ownerUserId`: responsável atual, opcional na abertura e obrigatório conforme regra de encaminhamento;
- `openedAt`;
- `resolvedAt`;
- `closedAt`;
- `version`: concorrência otimista;
- `createdAt`, `updatedAt`;
- `createdBy`, `updatedBy`;
- `deletedAt`, `deletedBy` quando soft delete for aplicável.

Uma solicitação deve estar associada a pelo menos uma referência de cliente: Empresa ou Contato. Se ambas forem informadas, as referências devem pertencer ao mesmo tenant e o vínculo Empresa–Contato deve ser coerente quando existente.

## Estados iniciais

`ServiceRequestStatus`:

- `OPEN`;
- `IN_PROGRESS`;
- `WAITING_CUSTOMER`;
- `RESOLVED`;
- `CLOSED`;
- `CANCELLED`.

Transições inválidas devem ser rejeitadas pelo domínio. Fechamento e cancelamento são eventos auditáveis.

## Prioridade inicial

`ServiceRequestPriority`:

- `LOW`;
- `MEDIUM`;
- `HIGH`;
- `URGENT`.

A prioridade não deve, na primeira entrega, calcular SLA automaticamente antes da existência de uma política de SLA explícita.

## Protocolo

O protocolo:

- é gerado somente no backend;
- nunca é fornecido pelo cliente da API;
- é imutável;
- é único;
- não contém dado pessoal;
- deve ser seguro para exposição em telas, relatórios e integrações futuras.

A implementação final do formato será definida na microentrega F3.1 por teste e migration. A geração não pode depender de contagem `SELECT COUNT(*)`, evitando condição de corrida.

## Interações da solicitação

A F3.3 introduzirá `ServiceRequestInteraction` para preservar o histórico operacional do atendimento.

Tipos iniciais:

- nota interna;
- registro de contato telefônico;
- mensagem registrada manualmente;
- alteração operacional relevante.

Integrações automáticas com e-mail, WhatsApp e telefonia continuam pertencendo à Fase 4. Na Fase 3, o canal pode ser registrado como metadado, mas não será criada integração externa.

## Filas e distribuição

A F3.4 introduzirá filas tenant-aware.

Uma fila deve possuir:

- identificação;
- nome;
- status ativo/inativo;
- membros ou critérios de atendimento;
- capacidade de receber solicitações;
- auditoria de configuração.

A primeira versão não terá motor automático sofisticado. Atribuição manual e encaminhamento entre filas precedem distribuição automática.

## SLA

A F3.5 introduzirá políticas de SLA sem acoplar o cálculo diretamente à prioridade.

Modelo esperado:

- `SlaPolicy`;
- condições de aplicação;
- prazo de primeira resposta;
- prazo de resolução;
- calendário operacional futuro;
- snapshot do SLA aplicado na solicitação;
- eventos de início, pausa, retomada, cumprimento e violação.

Uma alteração futura na política não deve reescrever retroativamente o SLA histórico de solicitações já abertas.

## Satisfação

A F3.7 adicionará captura de satisfação vinculada à solicitação encerrada.

Primeiro contrato:

- nota inteira de 1 a 5;
- comentário opcional;
- uma resposta válida por solicitação;
- timestamp;
- preservação de tenant;
- leitura restrita por permissão.

Disparos automáticos por canais externos permanecem fora da Fase 3.

## Segurança multiempresa

Todos os novos dados da Fase 3 devem:

- possuir `organizationId`;
- operar dentro de `PrismaService.withTenant()`;
- utilizar RLS;
- ativar `ENABLE ROW LEVEL SECURITY`;
- ativar `FORCE ROW LEVEL SECURITY`;
- falhar de forma fechada sem contexto tenant;
- impedir referência cross-tenant no serviço e, quando possível, também por constraints compostas no banco;
- retornar 404 para referências de outro tenant quando necessário para evitar enumeração de existência.

Nenhum endpoint aceita `organizationId` do browser como fonte de autorização.

## RBAC

Permissões propostas:

- `service_request.read`;
- `service_request.write`;
- `service_request.assign`;
- `service_request.close`;
- `service_queue.manage`;
- `service_sla.manage`;
- `service_satisfaction.read`.

As permissões deverão ser adicionadas somente nas microentregas que efetivamente precisarem delas. Não criar permissões antecipadamente sem consumidor.

Nenhum novo papel fixo será criado apenas para a Fase 3 inicial. A matriz existente será evoluída de forma compatível.

## Auditoria

Eventos mínimos esperados ao longo da fase:

- `service_request.created`;
- `service_request.updated`;
- `service_request.assigned`;
- `service_request.status_changed`;
- `service_request.resolved`;
- `service_request.closed`;
- `service_request.cancelled`;
- `service_request.interaction_added`;
- `service_request.queue_changed`;
- `service_request.sla_applied`;
- `service_request.satisfaction_recorded`.

Eventos devem manter ator, requestId, entidade, before/after seguro e tenant.

## Concorrência e integridade

Toda mutação sensível deverá avaliar concorrência otimista por `version`.

Atualização com versão stale deve retornar conflito explícito e nunca sobrescrever silenciosamente mudanças concorrentes.

## UX

A primeira UX será operacional e simples:

- lista de solicitações;
- busca por protocolo e texto;
- filtros por status, prioridade, fila e responsável;
- criação de solicitação;
- detalhe com histórico;
- alteração de status;
- atribuição;
- indicadores básicos de SLA quando disponíveis.

Kanban de atendimento, automações visuais e omnichannel não são requisitos iniciais.

## Microentregas

### F3.1 — Fundação Solicitação/Protocolo
- contratos;
- enums;
- schema Prisma;
- migration;
- RLS;
- constraints tenant-aware;
- testes RED/GREEN de isolamento e protocolo.

### F3.2 — API de Solicitações
- criar;
- listar;
- consultar;
- editar campos permitidos;
- mudar status;
- atribuir responsável;
- concorrência otimista;
- auditoria.

### F3.3 — Interações e Histórico
- interações vinculadas à solicitação;
- notas internas;
- registros de contato;
- timeline imutável para eventos relevantes.

### F3.4 — Filas de Atendimento
- CRUD administrativo de filas;
- encaminhamento;
- atribuição;
- filtros e auditoria.

### F3.5 — SLA
- políticas;
- aplicação;
- snapshot;
- primeira resposta;
- resolução;
- acompanhamento de cumprimento/violação.

### F3.6 — Web de Atendimento
- lista;
- criação;
- detalhe;
- timeline;
- filtros;
- status;
- responsável/fila conforme permissão.

### F3.7 — Satisfação
- nota 1–5;
- comentário;
- proteção contra duplicidade;
- indicadores.

### F3.8 — Relatórios, E2E e Release
- backlog consolidado;
- métricas operacionais;
- cobertura E2E;
- regressão de segurança;
- documentação operacional;
- checkpoint/release da Fase 3.

## Métricas iniciais

A fase deve preparar dados para:

- solicitações abertas;
- solicitações encerradas;
- backlog por status;
- backlog por prioridade;
- tempo médio até primeira resposta;
- tempo médio de resolução;
- cumprimento de SLA;
- solicitações por fila;
- solicitações por responsável;
- satisfação média.

Os relatórios serão adicionados apenas quando os dados correspondentes existirem de forma canônica.

## Fora do escopo da Fase 3

- WhatsApp automático;
- e-mail transacional integrado;
- telefonia/PABX;
- CTI;
- webhooks públicos;
- ERP;
- motor genérico de automação;
- workflow visual;
- chatbot;
- IA/RAG;
- scoring;
- classificação automática por LLM;
- roteamento automático por IA.

Esses itens permanecem para as Fases 4, 5 e 6.

## Critérios de aceite da Fase 3

1. Solicitações são isoladas por tenant no serviço e no banco.
2. Protocolo é gerado no servidor e é único.
3. Usuário sem permissão não lê nem altera solicitações.
4. Referências Empresa/Contato de outro tenant são rejeitadas sem vazamento de existência.
5. Mudanças relevantes geram auditoria.
6. Histórico de interações permanece rastreável.
7. Filas e SLAs não alteram dados de outro tenant.
8. Concorrência otimista impede sobrescrita silenciosa.
9. UI respeita as mesmas permissões da API.
10. Quality gate, E2E, Compose e build das imagens permanecem GREEN.
11. Nenhum merge na `main` ocorre sem gate técnico verde e gate humano do responsável.

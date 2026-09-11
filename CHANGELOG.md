# Changelog

## [Unreleased] - Cycle 3.6.6

### Web de oportunidades — movimentação de etapa

- movimentação de oportunidade exposta na Web somente para sessões com `opportunity.move`;
- seleção limitada às etapas pertencentes ao mesmo Pipeline da oportunidade;
- reutilização de `PATCH /api/v1/opportunities/:id/stage` com `{ stageId, version }`, preservando a concorrência otimista já existente na API;
- recarga da lista após movimentação bem-sucedida, refletindo a etapa persistida pelo backend;
- `canMove` derivado das permissões da sessão autenticada, sem criação de novas permissões RBAC;
- E2E dedicado valida login, bootstrap idempotente do funil padrão, criação de empresa e oportunidade, movimentação de `Prospecção` para `Qualificação` e persistência após reload;
- nenhuma alteração de banco, migrations, RLS, contratos de domínio ou API nesta microentrega;
- RED comportamental registrado no commit `9234413f0fb6ff8dee49082efdf9443cfba25acf` / workflow `34591013129` (#616);
- GREEN funcional intermediário validado no commit `920fa4090b97ebbb3a63abd868f24c1fa119497c` / workflow `34591600221` (#619), antes do E2E específico e da documentação final;
- edição geral, troca de Pipeline, Kanban, drag-and-drop e fechamento WON/LOST permanecem fora da C3.6.6;
- PR #33 permanece Draft e condicionado ao gate final GREEN no head documental definitivo e à aprovação humana explícita antes do merge.

## [Unreleased] - Cycle 3.6.4

### Web de oportunidades — lista

- nova seção `Oportunidades` integrada ao `CrmShell`, exibida somente para sessões com `opportunity.read`;
- primeira visualização Web do domínio canônico de oportunidades na Opção A — lista;
- listagem read-only consumindo `GET /api/v1/opportunities`, com paginação inicial, ordenação por `updatedAt desc` e busca textual via `q`;
- estados de carregamento, erro e vazio;
- cards com título, valor estimado e previsão de fechamento;
- nenhuma operação de criação, edição, movimentação de etapa ou fechamento WON/LOST foi adicionada nesta fatia;
- nenhuma alteração de API, Prisma schema, migrations, RLS ou RBAC;
- RED comportamental validado no commit `92fc8f741256554ad5d3dabedb8e9f1da3933940` / workflow `34551827072` (#563), pela ausência esperada da navegação `Oportunidades`;
- GREEN funcional pré-documentação validado no commit `b8ed7b1804e37fb266adcb2168161e56d09ab4e8` / workflow `34552351688` (#572), incluindo `pnpm verify`, E2E, Compose e imagens Docker;
- Kanban, drag-and-drop, detalhe completo, escrita Web, automações e IA permanecem fora da C3.6.4;
- PR #31 permanece Draft e condicionado ao gate final GREEN no head documental definitivo e à aprovação humana explícita antes do merge.

## [Unreleased] - Cycle 3.6.3

### Vínculo Activity → Opportunity

- Activity pode ser vinculada opcionalmente a uma Opportunity do mesmo tenant;
- create, update e list de Activities suportam `opportunityId`;
- FK composta impede vínculo cross-tenant no banco;
- Opportunity soft-deleted não pode ser usada como nova referência, enquanto vínculo histórico existente é preservado;
- snapshots de auditoria de Activity passam a incluir `opportunityId`.

## [Unreleased] - Cycle 3.6.2

### API tenant-aware de oportunidades

- contratos compartilhados para criação, consulta, edição, movimentação de etapa e filtros de oportunidades;
- `GET /api/v1/opportunities` com paginação, busca e filtros por Pipeline, Stage, responsável, empresa, contato e período previsto de fechamento;
- `GET /api/v1/opportunities/:id` com leitura isolada por organização;
- `POST /api/v1/opportunities` com `organizationId` derivado exclusivamente do contexto autenticado;
- `PATCH /api/v1/opportunities/:id` para edição cadastral sem permitir alteração de Pipeline ou Stage;
- `PATCH /api/v1/opportunities/:id/stage` para movimentação controlada somente dentro do Pipeline atual;
- `DELETE /api/v1/opportunities/:id` com soft delete e incremento de versão;
- `estimatedValue` representado como string decimal no contrato público, preservando `Decimal(19,2)` sem conversão para `number` JavaScript;
- validação final de cliente `Company` XOR `Contact`, referências no mesmo tenant, Pipeline/Stage ativos e owner com membership ativa;
- concorrência otimista por `version` nos PATCHes cadastral e de movimentação, com `409 OPPORTUNITY_VERSION_CONFLICT` para versão stale;
- isolamento tenant-aware por `PrismaService.withTenant()` e RLS fail-closed, com 404 para leitura/mutação cross-tenant e referências inválidas sem revelar existência;
- RBAC reutiliza exclusivamente `opportunity.read`, `opportunity.write` e `opportunity.move`, sem criação de novas permissões;
- auditoria `opportunity.created`, `opportunity.updated`, `opportunity.moved` e `opportunity.deleted` com ator, requestId, entidade e versões;
- testes adversariais cobrem soft delete, VIEWER somente leitura, SELLER com operações comerciais, referências inativas/cross-tenant, movimentação cross-pipeline rejeitada e concorrência otimista;
- Web/Kanban, drag-and-drop, troca de Pipeline, vínculo `Activity` → `Opportunity`, forecast avançado, multi-moeda, produtos/propostas, comissões, automações, integrações e IA permanecem fora desta entrega;
- PR #17 permanece Draft e condicionado a gate final GREEN no head documental definitivo, à integração correta da C3.6.1 e à aprovação humana explícita antes do merge.

## [Unreleased] - Cycle 3.6.1

### Fundação tenant-aware de oportunidades

- novo domínio canônico `Opportunity` na arquitetura Prisma/PostgreSQL;
- oportunidade vinculada obrigatoriamente a exatamente um cliente: `Company` XOR `Contact`;
- valor estimado em `Decimal(19,2)` com restrição de não negatividade no banco;
- coerência tenant-aware entre oportunidade, cliente, Pipeline e PipelineStage por chaves compostas;
- responsável obrigado a possuir membership na organização da oportunidade;
- campos de versionamento e soft delete preparados no modelo;
- índices tenant-aware para etapa/prazo, responsável/prazo, empresa, contato e pipeline/etapa;
- PostgreSQL RLS com `ENABLE` e `FORCE ROW LEVEL SECURITY` na tabela `opportunities`;
- policy fail-closed baseada em `app.current_organization_id`;
- testes adversariais confirmam isolamento entre organizações e rejeitam XOR inválido, valor negativo, referências cross-tenant, Stage/Pipeline incoerentes e owner sem membership;
- API REST, Web/Kanban, vínculo `Activity` → `Opportunity`, automações, forecast, produtos/propostas e novas permissões RBAC permanecem fora desta entrega;
- PR #15 permanece condicionado ao gate final GREEN no head documental e à aprovação humana explícita antes do merge.

## [Unreleased] - Cycle 3.5.4

### Web de atividades

- nova seção `Atividades` integrada ao `CrmShell` canônico, visível somente com `activity.read`;
- listagem por status `PENDING`, `COMPLETED` e `CANCELLED`, com busca explícita pelo parâmetro `q` da API;
- estados visuais de carregamento, erro, vazio e indicação de atividade pendente vencida;
- criação de tarefas e compromissos atribuída ao usuário autenticado, sem delegação de responsável;
- vínculos opcionais com Empresa e Contato usando os endpoints canônicos existentes;
- lifecycle Web para concluir, cancelar, reabrir e inativar atividades, com recarga da lista atual após cada mutação bem-sucedida;
- controles de criação e lifecycle disponíveis somente com `activity.write`; usuários somente-leitura não recebem comandos de mutação;
- fluxo E2E real cobre login, navegação em Atividades, criação de `Follow-up E2E`, conclusão e persistência na aba Concluídas;
- `Opportunity`, agenda/calendário, recorrência, notificações, automação de follow-up, Google/Outlook e delegação permanecem fora desta entrega;
- nenhuma alteração de API backend, Prisma schema, migrations ou RBAC na C3.5.4;
- PR #14 permanece condicionado ao gate final GREEN e à aprovação explícita antes do merge.

## [Unreleased] - Cycle 3.5.3

### Vínculos comerciais de atividades

- vínculo `Activity` → `Company` considerado atendido pela fundação e API já entregues, com FK real, validação tenant-aware e filtro por empresa;
- vínculo `Activity` → `Contact` considerado atendido pela fundação e API já entregues, com FK real, validação tenant-aware e filtro por contato;
- vínculo `Activity` → `Opportunity` formalmente diferido até a criação do domínio canônico de oportunidades;
- quando `Opportunity` existir, o vínculo deverá usar relação Prisma/FK real, índice tenant-aware e validação no mesmo tenant;
- rejeitada a criação de `opportunityId` solto, referência polimórfica genérica ou entidade Opportunity mínima apenas para satisfazer Activity;
- nenhuma alteração de produção em schema, migrations, API ou RBAC nesta microentrega;
- próxima etapa da linha 3.5: Web de Atividades.

## [Unreleased] - Cycle 3.5.2

### API tenant-aware de atividades

- contratos compartilhados de criação, atualização, filtros, tipos, status e prioridades de atividades;
- `GET /api/v1/activities` com paginação, busca e filtros por tipo, status, prioridade, responsável, empresa, contato e intervalo de prazo;
- `GET /api/v1/activities/:id` com leitura isolada por organização;
- `POST /api/v1/activities` para criação de tarefas e compromissos;
- `PATCH /api/v1/activities/:id` para edição e transições entre `PENDING`, `COMPLETED` e `CANCELLED`;
- `DELETE /api/v1/activities/:id` com soft delete;
- timestamps `completedAt` e `cancelledAt` controlados pelo servidor conforme a transição de status;
- validação tenant-aware de empresa, contato e responsável com membership ativa;
- permissões `activity.read` e `activity.write`, preservando leitura para `VIEWER` e escrita para perfis comerciais autorizados;
- tentativas de leitura, alteração ou uso de referências cross-tenant retornam `404`, sem revelar existência de recursos de outra organização;
- auditoria `activity.created`, `activity.updated`, `activity.completed`, `activity.cancelled` e `activity.deleted`;
- teste de integração cobre lifecycle, isolamento multiempresa, referências, RBAC, status e soft delete;
- interface Web, agenda, recorrência, notificações, automação de follow-up, integração Google/Outlook e vínculo com Opportunity permanecem fora da C3.5.2.

## [Unreleased] - Cycle 3.5.1

### Fundação tenant-aware de atividades

- novo domínio canônico `Activity` na arquitetura Prisma/PostgreSQL;
- tipos `TASK` e `APPOINTMENT`, status `PENDING`, `COMPLETED` e `CANCELLED`;
- prioridades `LOW`, `MEDIUM` e `HIGH`;
- responsável, prazo, rastreabilidade de criação/alteração e inativação lógica;
- vínculos opcionais com empresa e contato; vínculo com oportunidade permanece deliberadamente fora desta microentrega;
- índices tenant-aware por status/prazo, responsável/status/prazo, empresa e contato;
- PostgreSQL RLS com `ENABLE` e `FORCE ROW LEVEL SECURITY` na tabela `activities`;
- policy fail-closed baseada em `app.current_organization_id`;
- teste de integração confirma ausência de visibilidade sem contexto, isolamento entre tenants e rejeição de escrita cross-tenant;
- API REST, Web, agenda, recorrência, integrações de calendário e automação de follow-up permanecem fora da C3.5.1.

## [Unreleased] - Cycle 3.4

### Fundação do funil comercial

- entidades `Pipeline` e `PipelineStage` isoladas por organização;
- etapas padrão Prospecção, Qualificação, Proposta, Negociação, Ganha e Perdida;
- classificação de etapa `OPEN`, `WON` e `LOST`;
- posição única por pipeline e vínculo consistente entre pipeline, etapa e organização;
- PostgreSQL RLS com `ENABLE` e `FORCE ROW LEVEL SECURITY` para as duas novas tabelas;
- bootstrap idempotente do funil padrão por organização;
- permissão `pipeline.manage` restrita a `ADMIN` e `MANAGER`;
- `GET /api/v1/pipelines` para leitura tenant-aware do funil;
- `POST /api/v1/pipelines/default` para garantir o funil padrão;
- auditoria `pipeline.default_created` somente na criação efetiva;
- regressão de isolamento RLS entre organizações e de ausência de contexto;
- editor customizável de funil e CRUD completo de oportunidades permanecem fora da C3.4.

## [Unreleased] - Cycle 2

### CRM Core — empresas, contatos e relacionamento

- empresas com busca, edição, soft delete e auditoria;
- contatos independentes de empresa;
- canais de contato com suporte a e-mail, telefone, celular, WhatsApp e outros;
- controle de canal principal por tipo;
- vínculo e desvínculo empresa–contato;
- histórico de relacionamento para empresa, contato ou ambos;
- tags isoladas por organização e vinculáveis a empresas/contatos;
- campos customizáveis por organização nos escopos `COMPANY` e `CONTACT`;
- validação de tipo para campos `TEXT`, `NUMBER`, `BOOLEAN`, `DATE` e `SELECT`;
- App Shell Web com áreas de Empresas e Contatos;
- persistência visual de canais e histórico após recarregamento;
- restauração de sessão via refresh cookie HttpOnly;
- deduplicação da rotação de refresh token sob React Strict Mode;
- migration `20260907012000_cycle2_crm_core`;
- testes adversariais de isolamento entre organizações para empresas, contatos,
  canais, relacionamentos, tags e campos customizados;
- bloqueio de escrita por perfil `VIEWER` via permissões explícitas;
- E2E do CRM Core com login, empresa, contato, canal, vínculo, histórico, reload e
  verificação de persistência;
- validação de Compose e build das imagens API/Web no gate.

O checkpoint alvo é `v0.2.0-crm-core`. Ele permanece **não criado** enquanto o
gate final e a aprovação pós-testes não forem concluídos.

## [0.1.0] - 2026-09-05

### Identidade, acesso, multiempresa e auditoria

- organizações, usuários globais e memberships por organização;
- perfis fixos `ADMIN`, `MANAGER`, `SELLER` e `VIEWER`;
- permissões explícitas e guards de autenticação/autorização;
- senha protegida com Argon2id;
- access token JWT de curta duração;
- refresh token opaco armazenado somente por hash;
- rotação de refresh token e revogação da família após detecção de reutilização;
- logout com revogação imediata da sessão;
- bloqueio de usuário, organização ou membership inativos;
- administração de usuários restrita à organização ativa;
- proteção adversarial contra leitura e mutação cruzada entre organizações;
- auditoria append-only, paginada e restrita por permissão;
- auditoria de autenticação sem senha nem hash do refresh token;
- migration `20260901173000_cycle1_identity_access`;
- bootstrap explícito da primeira organização e administrador;
- interface Web de login, sessão ativa e logout;
- E2E de autenticação pela interface;
- CI com deploy de migrations antes do gate.

Checkpoint aprovado: `v0.1.0-identity-access`.

## [0.0.0] - 2026-08-30

### Fundação

- arquitetura Next.js + NestJS + PostgreSQL + Prisma aprovada;
- monorepositório pnpm e toolchain fixada;
- contratos TypeScript compartilhados;
- health check de processo e banco;
- validação de ambiente;
- correlação `x-request-id`;
- envelope de erros padronizado;
- logging estruturado com redação de segredos;
- Docker Compose para PostgreSQL, API e web;
- testes unitários, integração, contrato e E2E;
- CI com instalação congelada e build de contêineres;
- estratégia segura de transição a partir do AXE Relationship legado.

Checkpoint aprovado: `v0.0.0-foundation`.

## Pré-requisitos

Consulte `README.md`.

## Inicialização

Consulte `README.md`.

## Validação

A aprovação de cada ciclo depende do gate descrito no README e no workflow do
GitHub Actions.

## Arquitetura

Consulte `docs/architecture/foundation.md` e os documentos específicos de cada
ciclo.

## Testes

Consulte `docs/testing/README.md` e os testes automatizados da API/Web.

## Retorno

Enquanto o Cycle 2 não estiver aprovado, o rollback oficial permanece
`v0.1.0-identity-access`.

## Changelog

Este arquivo é o registro de mudanças funcionais e técnicas por ciclo.
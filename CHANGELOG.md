# Changelog

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

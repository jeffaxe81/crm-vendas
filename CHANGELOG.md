# Changelog

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

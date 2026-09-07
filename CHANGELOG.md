# Changelog

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

> O checkpoint do Ciclo 1 só deve ser criado após o gate integral ficar verde no mesmo commit.

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

A aprovação de cada ciclo depende do gate descrito no README e no workflow do GitHub Actions.

## Arquitetura

Consulte `docs/architecture/foundation.md` e os documentos específicos de cada ciclo.

## Testes

Consulte `docs/testing/README.md` e os testes automatizados da API/Web.

## Retorno

O retorno do Ciclo 1 usa `v0.0.0-foundation` enquanto seu próprio checkpoint não estiver aprovado.

## Changelog

Este arquivo é o registro de mudanças funcionais e técnicas por ciclo.

# Changelog

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

> A tag `v0.0.0-foundation` só será criada após o gate completo passar.

## Pré-requisitos

Consulte `README.md`.

## Inicialização

Consulte `README.md`.

## Validação

A versão depende do gate descrito no README.

## Arquitetura

Consulte `docs/architecture/foundation.md`.

## Testes

Consulte `docs/testing/README.md`.

## Retorno

A estratégia de rollback está no README e no ADR-0001.

# Fundação executável do CRM Axesistemas

## Arquitetura

O Cycle 0 estabelece uma fundação sem regras comerciais. O repositório é um monorepositório pnpm com dependência orientada da aplicação para contratos compartilhados.

```text
apps/web  ───────────────┐
                         ├── packages/contracts
apps/api ────────────────┘
   │
   └── PostgreSQL via Prisma
```

A API é NestJS e expõe inicialmente `/api/v1/health`. A aplicação web é Next.js e apresenta uma página de readiness. O banco do Cycle 0 não possui tabelas de negócio.

### Dependência e isolamento

- `apps/api` pode consumir `packages/contracts`;
- `apps/web` pode consumir contratos compartilhados quando necessário;
- pacotes compartilhados não dependem das aplicações;
- o PostgreSQL é acessado somente pela API;
- entidades comerciais e `organization_id` entram a partir do Cycle 1, conforme a especificação aprovada.

### Health contract

O health check só informa `database: up` depois de uma consulta `SELECT 1` bem-sucedida. Isso evita confundir processo iniciado com serviço pronto.

### Banco

O desenvolvimento local usa PostgreSQL 18 pelo Compose. O Prisma usa `@prisma/adapter-pg` e `pg`. O Prisma Client é gerado em `apps/api/src/generated/prisma` e compilado junto com a API.

### Correlação e erros

Cada requisição recebe `x-request-id`. Um identificador de entrada só é aceito quando corresponde ao formato permitido; caso contrário, a API gera um UUID.

Erros públicos seguem `{ code, message, request_id, details }`. Falhas internas não expõem stack trace ao consumidor.

### Logs

O NestJS usa Pino. Headers de autenticação, cookies e campos como `password`, `token` e `secret` são redigidos.

### Topologia de contêineres

```text
web :3000
  │
  └────> api :3001
            │
            └────> postgres :5432
```

O Compose exige PostgreSQL saudável antes da API e API saudável antes da web.

## Pré-requisitos

Consulte o README raiz para Node 24.20.0, pnpm 11.3.0, Docker e Git.

## Inicialização

A inicialização padrão usa `.env` na raiz, PostgreSQL pelo Compose, geração do Prisma Client e `pnpm dev`.

## Validação

A arquitetura é validada por typecheck, testes, build, Compose, E2E e CI.

## Testes

Os testes de arquitetura cobrem health contract, conexão PostgreSQL, request ID, envelope de erro, configuração de logs e topologia Compose.

## Retorno

O `main` legado é preservado até o aceite da fundação. A tag `v0.0.0-foundation` será criada somente após o gate completo.

## Changelog

As mudanças da fundação são registradas no `CHANGELOG.md`.

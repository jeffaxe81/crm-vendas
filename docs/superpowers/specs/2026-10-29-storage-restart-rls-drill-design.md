# Storage Restart / RLS Drill — Design

## Intent

Fechar a parte automatizável da homologação da issue #246 com um drill sintético de persistência após reconexão, isolamento RLS e rollback.

## Goals

- configurar quota em tenant A com papel restrito;
- destruir e recriar a conexão da aplicação e comprovar persistência;
- provar que tenant B não lê linhas de A;
- provocar rollback transacional e comprovar que a configuração anterior permanece;
- não excluir backups nem alterar armazenamento real.

## Non-goals

- não testar volume físico real;
- não realizar operação destrutiva em produção;
- não declarar homologação de servidor.

## Approach

Novo integration spec PostgreSQL usando as mesmas conexões owner/RLS existentes. O teste trabalha apenas com organizações sintéticas, reconecta `PrismaService` e usa transação abortada deliberadamente para validar rollback.

## Acceptance

Restart simulado preserva configuração, RLS continua isolando tenants e falha dentro da transação não deixa alteração parcial.

## Safety and evidence limits

- The drill refuses non-test mode, remote database hosts, missing URLs, and owner/RLS connections targeting different databases before constructing clients.
- Before creating fixtures, it asserts that the restricted role is neither superuser nor BYPASSRLS and that the allocation table enables and forces RLS.
- Organization slugs are unique per run. No global TRUNCATE or automatic deletion runs; synthetic fixtures and immutable audit rows remain in the dedicated local test database. Dispose of that database separately when no longer needed.
- Rollback requires exactly one affected allocation row before the deliberate failure, then reads the original value after rollback.
- Reconnection is simulated at the Prisma client boundary. This does not restart PostgreSQL or validate real volumes, backups, server recovery, or production readiness. Manual environment validation remains pending; no GO is implied.

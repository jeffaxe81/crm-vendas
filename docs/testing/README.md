# Estratégia de testes — Cycle 0

## Testes

| Nível       | Ferramenta               | Escopo                                        |
| ----------- | ------------------------ | --------------------------------------------- |
| Repositório | Node test runner         | Versões fixadas e contrato Compose            |
| Contratos   | Vitest                   | Schemas e tipos compartilhados                |
| Web         | Vitest + Testing Library | Readiness da interface                        |
| API         | Jest                     | Health, ambiente, request ID, erros e logging |
| Integração  | Jest + PostgreSQL        | Conectividade real pelo Prisma                |
| E2E         | Playwright               | Jornada browser + health da API               |
| Container   | Docker Compose           | Build, dependências e health checks           |

Comandos:

```bash
pnpm test:repo
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify
```

Qualidade é medida por comportamentos protegidos, não por um percentual genérico de cobertura.

## Pré-requisitos

O PostgreSQL deve estar saudável para testes de integração e E2E. O Prisma Client deve ser gerado antes de typecheck/test/build em instalações novas.

## Inicialização

```bash
docker compose up -d postgres
pnpm --filter @axes/api prisma:generate
```

## Validação

O CI executa instalação congelada, geração do Prisma Client, `pnpm verify`, Playwright, validação do Compose e build das imagens.

## Arquitetura

Os testes seguem os limites dos pacotes: contratos, web e API podem ser verificados separadamente, enquanto E2E cobre a integração.

## Retorno

Falha no gate impede o checkpoint do ciclo. O último checkpoint aprovado deve ser mantido recuperável.

## Changelog

Alterações na estratégia de testes devem ser registradas junto ao ciclo correspondente.

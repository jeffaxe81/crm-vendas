# ADR-0001 — Fundação técnica

**Status:** Aceito  
**Data:** 30 de agosto de 2026

## Arquitetura

Adotar monorepositório TypeScript com Next.js para web, NestJS para API, PostgreSQL, Prisma, contratos compartilhados e Docker Compose.

### Contexto

O CRM existente no `main` foi construído com Vite, Express/tRPC, MySQL e Drizzle. A evolução aprovada precisa nascer preparada para isolamento multiempresa, API versionada, contratos estáveis, auditoria e integração futura com os demais produtos Axesistemas.

### Decisão

- modular monolith no MVP;
- frontend e backend separados dentro do mesmo monorepositório;
- PostgreSQL como banco relacional;
- Prisma para acesso e migrações;
- REST/OpenAPI como contrato externo;
- Outbox no PostgreSQL para eventos futuros;
- Docker Compose como ambiente reproduzível inicial;
- Node 24.20.0 e pnpm 11.3.0 fixados;
- nenhuma entidade comercial no Cycle 0.

### Alternativas rejeitadas neste ciclo

- manter MySQL/Drizzle como arquitetura alvo: não corresponde à decisão de produto aprovada;
- microsserviços: complexidade operacional prematura;
- Redis/fila externa: não necessária à fundação;
- Kubernetes: não necessário antes de existir escala;
- reescrever diretamente o `main`: risco desnecessário ao checkpoint operacional existente.

### Consequências

A transição ocorre em branch separada. A fundação precisa passar por gate reproduzível antes de qualquer merge. A migração de dados do legado será tratada separadamente e não será improvisada dentro do Cycle 0.

## Pré-requisitos

As versões e ferramentas fixadas devem estar disponíveis antes da validação.

## Inicialização

O ambiente é inicializado pelos comandos do README e pelo Compose.

## Validação

A decisão só é considerada materializada quando CI, testes e contêineres passarem.

## Testes

Contratos arquiteturais, integração de banco e E2E fazem parte do gate.

## Retorno

O `main` legado permanece recuperável e a fundação receberá tag própria após aprovação.

## Changelog

Este ADR é a decisão-base da versão `0.0.0`.

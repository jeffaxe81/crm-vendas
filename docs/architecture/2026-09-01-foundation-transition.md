# Transição do CRM atual para a fundação aprovada

**Data:** 1 de setembro de 2026  
**Branch:** `cycle-0-foundation`

## Estado encontrado no repositório

O `main` contém a aplicação AXE Relationship já funcional, construída sobre Vite + React no frontend, Express no backend, tRPC, MySQL e Drizzle. O último checkpoint registrado no `main` é de 25 de agosto de 2026.

A arquitetura aprovada em 30 de agosto de 2026 para a evolução do produto é diferente: monorepositório com Next.js, NestJS, PostgreSQL, Prisma, contratos compartilhados e Docker Compose.

## Regra de preservação

O `main` não será sobrescrito durante a construção da nova fundação. A evolução será realizada nesta branch até que o Cycle 0 esteja reproduzível, validado e com rollback documentado.

## Estratégia de transição

1. manter o `main` como checkpoint operacional da aplicação atual;
2. registrar no repositório a especificação aprovada;
3. montar a estrutura de fundação na branch `cycle-0-foundation`;
4. validar instalação, build, testes, API, web e PostgreSQL;
5. documentar migração dos dados MySQL/Drizzle para PostgreSQL/Prisma;
6. somente depois decidir o merge ou substituição do `main`;
7. não excluir dados ou histórico durante a transição.

## Diferenças que precisam ser tratadas

| Tema | Estado atual | Estado aprovado |
|---|---|---|
| Frontend | React + Vite | Next.js |
| Backend | Express + tRPC | NestJS + REST/OpenAPI |
| Banco | MySQL | PostgreSQL |
| ORM | Drizzle | Prisma |
| Organização do código | app único | monorepositório modular |
| Multiempresa | não garantido estruturalmente | `organization_id` + memberships + isolamento |
| Eventos | acoplados à aplicação atual | Outbox transacional |
| Containers | sem `compose.yaml` no `main` | Docker Compose obrigatório |
| Checkpoint | commits históricos | tag por ciclo + instrução de retorno |

## Critério para encerrar o Cycle 0

O Cycle 0 só poderá receber a tag `v0.0.0-foundation` quando:

- instalação com lockfile for reproduzível;
- PostgreSQL, API e web iniciarem pelos comandos documentados;
- health check validar processo e banco;
- testes unitários, integração, contrato e e2e passarem;
- Docker build e Compose forem válidos;
- documentação permitir reproduzir o ambiente em outra máquina;
- o repositório estiver limpo no commit verificado.

## Próxima execução

Implementar a fundação técnica na branch, começando pela toolchain do monorepositório e pelo contrato de saúde. Nenhuma funcionalidade comercial nova entra no Cycle 0.

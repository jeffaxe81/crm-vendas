# Cycle 4 — Follow-up Completion Design

## Goal

Fechar formalmente o Cycle 4 do roadmap original completando ACT-003 — Follow-ups e atrasos — sem reimplementar ACT-001/ACT-002, que já estão presentes no `main`.

## Current state

- ACT-001: CRUD/lifecycle de atividades já existe com responsável, prioridade, prazo, vínculos e auditoria.
- ACT-002: Agenda Comercial já existe com semana, hoje, atrasadas, filtros e exportação.
- ACT-003: atrasos já são derivados por prazo/status, mas `FOLLOW_UP` ainda não existe como tipo explícito; contratos e UI aceitam apenas `TASK` e `APPOINTMENT`.

## Design

Adicionar `FOLLOW_UP` ao enum `ActivityType` em contratos, Prisma e banco. A API deve reutilizar o CRUD e filtros atuais sem criar endpoint paralelo. Atividades Web e Agenda devem permitir criar, filtrar e exibir follow-ups com o rótulo "Follow-up".

## Constraints

- Nenhuma alteração direta em `main`.
- Sem nova dependência.
- Preservar isolamento por `organizationId` e RLS existente.
- Preservar os estados `PENDING | COMPLETED | CANCELLED`.
- "Atrasado" continua sendo derivado de `status=PENDING` + `dueAt < now`; não vira estado persistido.
- TDD obrigatório antes de produção.
- Gate completo antes de checkpoint/merge.

## Acceptance

1. contratos aceitam `FOLLOW_UP` em create/update/list;
2. migration adiciona o valor ao enum PostgreSQL de forma reproduzível;
3. API cria/lista/atualiza follow-up com as mesmas regras multiempresa;
4. UI Atividades cria e filtra Follow-up;
5. Agenda filtra e apresenta Follow-up;
6. follow-up vencido aparece nas visões de atraso existentes;
7. regressão completa permanece verde.

# Cycle 4 Follow-up Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar ACT-003 adicionando FOLLOW_UP como tipo explícito de atividade e integrando-o às telas e filtros existentes.

**Architecture:** Reutilizar integralmente o modelo/API de Activity existente. A mudança é aditiva no enum e nas superfícies Web; atrasos continuam derivados por prazo e status, sem novo estado persistido.

**Tech Stack:** TypeScript, Zod, NestJS, Prisma/PostgreSQL, Next.js/React, Vitest/Jest/Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-c4-follow-up-completion.md`

## Global Constraints

- Branch isolada: `feat/c4-follow-up-completion-20261102`.
- Base: `main@ce0780dacb89dd5656a64dfee9eacfcdc21848c2`.
- Sem nova dependência.
- Preservar isolamento multiempresa/RLS.
- `OVERDUE` não é status persistido.
- Testes primeiro; gate integral antes de checkpoint ou merge.

## Review Focus

- FOLLOW_UP em create/update/list sem quebrar TASK/APPOINTMENT.
- Migration aditiva do enum PostgreSQL em banco vazio.
- Follow-up vencido aparece no filtro de atrasadas já existente.
- VIEWER/read-only continua sem escrita.
- Agenda e Atividades usam o mesmo valor canônico `FOLLOW_UP`.

---

### Task 1: Contratos e persistência

**Files:**

- Modify: `packages/contracts/src/activities.ts`
- Modify: `packages/contracts/src/activities.test.ts` ou teste equivalente existente
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261102121500_c4_activity_follow_up/migration.sql`
- Test: `apps/api/src/activities/activities.integration.spec.ts`

**Interfaces:**

- Consumes: `ActivityTypeSchema`, CRUD atual de Activities.
- Produces: valor canônico `FOLLOW_UP`.

- [ ] **Step 1:** escrever RED de contratos aceitando FOLLOW_UP em create e filtro.
- [ ] **Step 2:** escrever RED de integração criando/listando FOLLOW_UP e mantendo isolamento.
- [ ] **Step 3:** executar testes e confirmar RED.
- [ ] **Step 4:** adicionar FOLLOW_UP ao contrato e Prisma enum.
- [ ] **Step 5:** criar migration PostgreSQL aditiva.
- [ ] **Step 6:** executar testes GREEN.
- [ ] **Step 7:** commit.

### Task 2: Atividades e Agenda Web

**Files:**

- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/activities/activities-view.test.tsx`
- Modify: `apps/web/src/app/agenda/agenda-view.tsx`
- Test: testes existentes de Agenda ou novo teste focado.

**Interfaces:**

- Consumes: API `/activities` com `type=FOLLOW_UP`.
- Produces: criação, filtro e exibição de Follow-up.

- [ ] **Step 1:** escrever RED da criação/filtro Follow-up em Atividades.
- [ ] **Step 2:** escrever RED do filtro/exibição Follow-up na Agenda.
- [ ] **Step 3:** executar RED.
- [ ] **Step 4:** implementar rótulo/opção `Follow-up` nas duas views.
- [ ] **Step 5:** executar GREEN e regressão Web.
- [ ] **Step 6:** commit.

### Task 3: Fechamento do Cycle 4

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/checkpoints/cycle-4-current.md`
- Modify: PR checklist.

- [ ] **Step 1:** executar gate completo no mesmo SHA.
- [ ] **Step 2:** revisar isolamento por organizationId/RLS, VIEWER e auditoria.
- [ ] **Step 3:** documentar ACT-001/002 preexistentes e ACT-003 concluído.
- [ ] **Step 4:** apresentar evidência final sem merge.
- [ ] **Step 5:** criar checkpoint imutável somente após gate verde e aprovação.

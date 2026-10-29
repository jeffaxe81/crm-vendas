# Dashboard Concurrency Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar concorrência opt-in e limitada ao smoke read-only de dashboards sem alterar o modo sequencial existente.

**Architecture:** Evoluir somente `scripts/dashboard-staging-smoke.mjs` e seus testes. A validação de tenant/cache continua sendo executada em toda amostra.

**Tech Stack:** Node.js 24, node:test, Fetch API.

**Spec:** `docs/superpowers/specs/2026-10-29-dashboard-concurrency-evidence-design.md`

## Global Constraints

- Dados sintéticos somente.
- Nenhuma mutação HTTP.
- Nunca imprimir token ou URL privada.
- Não declarar SLA/GO.

## Review Focus

- concorrência fora do limite falha antes de requests;
- modo sem `concurrency` mantém resultado anterior;
- contagens/cache são revalidados sob paralelismo;
- número de amostras por tenant é exato;
- relatório não contém credenciais.

### Task 1: Concorrência opt-in

**Files:**

- Modify: `tests/dashboard-staging-smoke.test.mjs`
- Modify: `scripts/dashboard-staging-smoke.mjs`

- [ ] **Step 1: Write failing tests**
      Adicionar casos para `performance.concurrency=3`, compatibilidade sem campo e rejeição de 0/valor acima do limite.
- [ ] **Step 2: Run RED**
      Run: `node --test tests/dashboard-staging-smoke.test.mjs`
      Expected: FAIL porque a configuração atual rejeita `concurrency`.
- [ ] **Step 3: Implement bounded parallel sampling**
      Aceitar `concurrency?: 1..20`, default 1; processar amostras em lotes limitados; preservar validação por request.
- [ ] **Step 4: Run GREEN**
      Run: `node --test tests/dashboard-staging-smoke.test.mjs`
      Expected: PASS.
- [ ] **Step 5: Run repository gate**
      Run: `pnpm test:repo && pnpm verify`
      Expected: PASS.

# Dashboard Gate 0 Break-Glass Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar política fail-closed verificável para break-glass sem habilitar acesso privilegiado.

**Architecture:** Manifesto JSON versionado + validador Node puro + testes adversariais. Nenhum runtime de autenticação será alterado.

**Tech Stack:** Node.js 24, node:test, JSON.

**Spec:** `docs/superpowers/specs/2026-10-29-dashboard-gate0-break-glass-design.md`

## Global Constraints

- `breakGlassEnabled=false`.
- `productionApproved=false`.
- MFA, segundo aprovador distinto, escopo, TTL e auditoria são obrigatórios.

## Review Focus

- autoaprovação;
- TTL excessivo;
- wildcard de escopo;
- MFA/auditoria ausentes;
- estado forjado de aprovação.

### Task 1: Manifesto e validador

**Files:**

- Create: `docs/quality/dashboard-break-glass-policy.json`
- Create: `scripts/check-dashboard-break-glass-policy.mjs`
- Create: `tests/dashboard-break-glass-policy.test.mjs`

- [ ] **Step 1: Write failing tests**
      Testar manifesto ausente e entradas inválidas antes do validador existir.
- [ ] **Step 2: Run RED**
      Run: `node --test tests/dashboard-break-glass-policy.test.mjs`
      Expected: FAIL por módulo/manifesto ausente.
- [ ] **Step 3: Implement validator + manifest**
      Máximo TTL 30 minutos; dois atores distintos; MFA obrigatório; scopes explícitos; audit trail obrigatório; estados de GO rejeitados.
- [ ] **Step 4: Run GREEN**
      Run: `node --test tests/dashboard-break-glass-policy.test.mjs`
      Expected: PASS.
- [ ] **Step 5: Run repository gate**
      Run: `pnpm test:repo && pnpm verify`
      Expected: PASS.

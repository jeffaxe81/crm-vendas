# Restore Policy Coverage Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que novos modelos/políticas de backup entrem sem tratamento explícito no restore.

**Architecture:** Gate de cobertura no módulo de data-management usando `TENANT_DATA_REGISTRY` e `unsupportedRestoreModels`; sem executar mutações.

**Tech Stack:** TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-10-29-restore-policy-coverage-design.md`

## Global Constraints

- Não habilitar restore.
- Não alterar banco.
- Políticas especiais permanecem explícitas.

## Review Focus

- novo REPLACE esquecido;
- novo policy especial sem mapeamento;
- Organization root tratada como grafo comum;
- policies EXCLUDE/PRESERVE confundidas com REPLACE;
- contagens inválidas continuam fail-closed.

### Task 1: Coverage gate

**Files:**

- Create: `apps/api/src/data-management/restore-policy-coverage.spec.ts`
- Modify only if needed: `apps/api/src/data-management/restore-executor.ts`

- [ ] **Step 1: Write failing coverage test**
      Construir contagens sintéticas para todo `ORGANIZATION + REPLACE` e exigir zero unsupported; fixar matriz dos policies especiais atuais.
- [ ] **Step 2: Run RED**
      Run: `pnpm --filter @axes/api test -- restore-policy-coverage.spec.ts`
      Expected: FAIL inicialmente por ausência do contrato exportado de cobertura especial.
- [ ] **Step 3: Expose minimal reviewed coverage metadata**
      Exportar somente metadados necessários ao teste, sem alterar execução.
- [ ] **Step 4: Run GREEN**
      Run: `pnpm --filter @axes/api test -- restore-policy-coverage.spec.ts`
      Expected: PASS.
- [ ] **Step 5: Run restore regressions + full gate**
      Run: `pnpm --filter @axes/api test -- restore-executor && pnpm verify`
      Expected: PASS.

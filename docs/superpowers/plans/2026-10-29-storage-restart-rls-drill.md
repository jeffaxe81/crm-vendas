# Storage Restart / RLS Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar um drill sintético de persistência pós-reconexão, RLS e rollback para gestão de armazenamento.

**Architecture:** Novo integration spec PostgreSQL reutilizando `PrismaService` e `TenantStorageAllocationService`; nenhuma mudança de produção esperada salvo defeito comprovado.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest.

**Spec:** `docs/superpowers/specs/2026-10-29-storage-restart-rls-drill-design.md`

## Global Constraints
- Tenants sintéticos.
- Papel restrito/RLS.
- Sem exclusão de backup.
- Sem alegar homologação real.

## Review Focus
- configuração perdida após reconexão;
- tenant B enxergando A;
- transação abortada deixando escrita parcial;
- conexão owner mascarando RLS;
- cleanup contaminando outras suítes.

### Task 1: Restart/RLS/rollback drill
**Files:**
- Create: `apps/api/src/data-management/storage-restart-rls.integration.spec.ts`

- [ ] **Step 1: Write integration test**
Configurar tenant A, recriar conexão restrita, validar persistência; consultar de B e esperar vazio; abortar mudança em transação e validar valor anterior.
- [ ] **Step 2: Run test**
Run: `pnpm --filter @axes/api test -- storage-restart-rls.integration.spec.ts`
Expected: PASS se invariantes atuais estiverem corretas; qualquer falha vira RED de bug real antes de correção.
- [ ] **Step 3: Fix only proven defect if present**
Alterar somente serviço/locking/RLS correspondente à causa raiz.
- [ ] **Step 4: Run full data-management regression**
Run: `pnpm --filter @axes/api test -- data-management`
Expected: PASS.
- [ ] **Step 5: Run full gate**
Run: `pnpm verify`
Expected: PASS.

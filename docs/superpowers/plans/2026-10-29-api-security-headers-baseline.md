# HTTP Security Headers Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar baseline automatizado dos headers do Nginx e uma Permissions-Policy mínima.

**Architecture:** Teste de contrato lê o template versionado de Nginx. A única mudança de runtime é o header `Permissions-Policy`; CSP/COOP/rate limit ficam fora desta frente.

**Tech Stack:** Node.js 24, node:test, Nginx config.

**Spec:** `docs/superpowers/specs/2026-10-29-api-security-headers-baseline-design.md`

## Global Constraints

- Não quebrar OAuth/iframe.
- Não bloquear microfone/câmera.
- Preservar TLS 1.2/1.3 e redirect.

## Review Focus

- header sem `always`;
- HSTS removido/afrouxado;
- redirect HTTP perdido;
- TLS 1.0/1.1 reintroduzido;
- Permissions-Policy bloqueando voz/vídeo.

### Task 1: Contract RED/GREEN

**Files:**

- Create: `tests/nginx-security-headers.test.mjs`
- Modify: `deploy/nginx/crm-vendas.conf`

- [ ] **Step 1: Write failing test**
      Exigir HSTS, nosniff, SAMEORIGIN, referrer policy, TLS 1.2/1.3, redirect e `Permissions-Policy "geolocation=(), payment=(), usb=()"` com `always`.
- [ ] **Step 2: Run RED**
      Run: `node --test tests/nginx-security-headers.test.mjs`
      Expected: FAIL apenas pela Permissions-Policy ausente.
- [ ] **Step 3: Add minimal header**
      Adicionar uma linha `add_header Permissions-Policy "geolocation=(), payment=(), usb=()" always;`.
- [ ] **Step 4: Run GREEN**
      Run: `node --test tests/nginx-security-headers.test.mjs`
      Expected: PASS.
- [ ] **Step 5: Run repository/full gate**
      Run: `pnpm test:repo && pnpm verify`
      Expected: PASS.

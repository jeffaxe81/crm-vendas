# Email OAuth Homologation Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor uma avaliação sanitizada de prontidão OAuth por tenant/provedor sem ativar envio.

**Architecture:** Função pura no domínio email que reutiliza o resolver de clientes e valida somente presença/formato de configuração. Não retorna clientId, secret, token ou callback privado.

**Tech Stack:** TypeScript, NestJS/Jest.

**Spec:** `docs/superpowers/specs/2026-10-29-email-oauth-homologation-preflight-design.md`

## Global Constraints
- `DisabledEmailProvider` permanece binding único.
- Nenhum request externo no preflight.
- Nunca retornar segredos.

## Review Focus
- registro de outro tenant;
- secret malformado;
- chaves de vault/pending ausentes;
- provider inválido;
- falsa indicação de envio ativo.

### Task 1: Preflight puro
**Files:**
- Create: `apps/api/src/messaging/email/email-oauth-homologation-preflight.ts`
- Create: `apps/api/src/messaging/email/email-oauth-homologation-preflight.spec.ts`

- [ ] **Step 1: Write failing tests**
Cobrir incompleto, tenant errado, segredo inválido e configuração completa.
- [ ] **Step 2: Run RED**
Run: `pnpm --filter @axes/api test -- email-oauth-homologation-preflight.spec.ts`
Expected: FAIL por módulo ausente.
- [ ] **Step 3: Implement evaluator**
Retornar somente `status`, `provider`, `readyForControlledHomologation`, `sendingEnabled:false` e códigos de pendência.
- [ ] **Step 4: Run GREEN**
Run: `pnpm --filter @axes/api test -- email-oauth-homologation-preflight.spec.ts email-release-guard.spec.ts`
Expected: PASS.
- [ ] **Step 5: Run full gate**
Run: `pnpm verify`
Expected: PASS.

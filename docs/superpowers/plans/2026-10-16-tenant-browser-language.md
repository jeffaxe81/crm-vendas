# Tenant Browser Language Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Translate the CRM into pt-BR, en and es under an independent tenant policy.
**Architecture:** Store defaultLanguage and detectBrowserLanguage on Organization. Resolve locale in a tenant-keyed React provider using navigator.languages[0], with pt-BR as fallback. Translate application-owned copy through versioned catalogs; keep customer content unchanged.
**Tech Stack:** Next.js 16, React 19, Zod, NestJS, Prisma/PostgreSQL, Vitest/Jest.
**Spec:** docs/superpowers/specs/2026-10-16-tenant-language-design.md

## Global Constraints

- Português do Brasil permanece como padrão.
- No external translation service, currency conversion or translation of customer records.
- Tenant identity comes from the authenticated session; organization.manage controls changes.
- Login before tenant identification stays in pt-BR; remembered policy is scoped by tenant slug and revalidated after authentication.
- Windows 7 compatibility is not guaranteed by this feature.

## Review Focus

- Primary unsupported browser language must yield pt-BR, even if a secondary language is supported.
- Delayed responses from a previous session must not overwrite the active tenant.
- Failed configuration requests must not silently enable editing with default settings.
- User data matching a translated label must remain untouched.
- Legacy backup compatibility must be reported when the schema fingerprint changes.

### Task 1: Contracts and tenant persistence

**Files:** packages/contracts/src/language-settings.ts and .spec.ts; apps/api/src/localization/*; apps/api/prisma/schema.prisma; migration; generated backup metadata; app.module.ts.
**Interfaces:** LanguageSettings { defaultLanguage: 'pt-BR' | 'en' | 'es'; detectBrowserLanguage: boolean }; resolveLanguage(settings, browserLanguages): Language; GET/PUT /organization/language-settings.

- [ ] Add failing contract tests for defaults, strict input and browser primary-language resolution; run contracts tests.
- [ ] Add failing API tests for authorization, strict validation and two-tenant persistence/auditing; run Jest.
- [ ] Implement contract, controller, module and organization columns with database constraints; regenerate schema metadata.
- [ ] Run contract/API tests, including snapshot and migration coverage; commit.

### Task 2: Tenant provider and administration

**Files:** apps/web/src/i18n/*; apps/web/src/app/admin/language-settings-view.tsx; page.tsx; workspace navigation contracts.
**Interfaces:** useTranslation(): { t, locale }; LanguageProvider(session); GET/PUT API from task 1.

- [ ] Add failing tests for manual/automatic locale, languagechange, tenant switching, stale replies, settings save/error states and customer-data preservation.
- [ ] Implement tenant-keyed provider, guarded administration view and navigation; maintain pt-BR on initial server/client render; isolate remembered login policy by tenant.
- [ ] Run frontend tests and typecheck; commit.

### Task 3: Application copy migration and delivery

**Files:** application TSX screens, label helpers, API error presentation, en/es catalogs, catalog coverage tests, release notes.
**Interfaces:** Translate stable application messages and safe interpolation via task 2; never translate customer records or external content.

- [ ] Add failing catalog coverage and representative end-to-end screen tests for English and Spanish.
- [ ] Migrate UI copy, accessibility labels, validation and application errors; populate reviewed catalogs and keep pt-BR fallback.
- [ ] Verify catalog parity, placeholders, login policy, all frontend tests, API tests where infrastructure permits, typechecks and production build.
- [ ] Review diff, fix material findings, commit and create a reviewable PR. Report actual verification and deployment limitations.

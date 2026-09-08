# Cycle 2 CRM Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar empresas, contatos/canais, vínculo empresa-contato, histórico, tags e campos customizáveis com isolamento multiempresa, auditoria e interface Web utilizável.

**Architecture:** O domínio entra no monólito modular existente. Todos os serviços recebem `organizationId` do principal autenticado, nunca da entrada livre do cliente. Contratos ficam em `packages/contracts`, persistência em Prisma/PostgreSQL, API em módulos NestJS e Web em Next.js consumindo os contratos compartilhados.

**Tech Stack:** Node 24.20.x, pnpm 11.3.0, TypeScript, NestJS 12, Next.js 16, React 19, PostgreSQL 18, Prisma 7.10.0, Zod, Jest, Vitest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-06-cycle-2-crm-core-design.md`

## Global Constraints

- Base obrigatória: `main` após merge do Cycle 1.
- Branch: `cycle-2-crm-core`.
- Não implementar diretamente em `main`.
- `organizationId` vem exclusivamente de `request.auth.organizationId`.
- RLS permanece backlog pré-comercialização e não entra neste ciclo.
- `VIEWER` é somente leitura.
- Contato pode existir sem empresa.
- Histórico funcional é separado de `audit_logs`.
- Campos customizados suportam apenas `TEXT | NUMBER | BOOLEAN | DATE | SELECT`.
- Sem fórmulas, scripts, automações, funil, oportunidade, atividade, agenda, IA ou integrações externas.
- Checkpoint `v0.2.0-crm-core` somente após gate integral verde e aprovação pós-testes.

---

### Task 1: Contratos do domínio CRM

**Files:**

- Create: `packages/contracts/src/companies.ts`
- Create: `packages/contracts/src/contacts.ts`
- Create: `packages/contracts/src/relationship.ts`
- Create: `packages/contracts/src/tags.ts`
- Create: `packages/contracts/src/custom-fields.ts`
- Create: `packages/contracts/src/crm-core.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Consumes: convenções Zod existentes.
- Produces: `CompanyCreateInputSchema`, `CompanyUpdateInputSchema`, `ContactCreateInputSchema`, `ContactChannelInputSchema`, `RelationshipEntryCreateInputSchema`, `TagInputSchema`, `CustomFieldDefinitionInputSchema`, `CustomFieldValueInputSchema`, `PaginationQuerySchema`.

- [ ] **Step 1: Write failing contract tests**

```ts
it("accepts a contact without company", () => {
  expect(
    ContactCreateInputSchema.parse({ fullName: "Ana Silva" })
  ).toMatchObject({
    fullName: "Ana Silva",
  });
});

it("rejects SELECT custom field without options", () => {
  expect(() =>
    CustomFieldDefinitionInputSchema.parse({
      scope: "COMPANY",
      key: "segment",
      label: "Segmento",
      type: "SELECT",
      options: [],
    })
  ).toThrow();
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm --filter @axes/contracts test -- crm-core.test.ts`
Expected: FAIL because schemas do not exist.

- [ ] **Step 3: Implement schemas and exported types**

Use strict Zod objects, `.trim()` for names/keys, `limit <= 100`, UUIDs for IDs, and refine `SELECT` to require at least one option.

- [ ] **Step 4: Export contracts**

Add explicit named exports in `packages/contracts/src/index.ts`.

- [ ] **Step 5: Run GREEN**

Run: `pnpm --filter @axes/contracts test -- crm-core.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat(contracts): add CRM core contracts`

---

### Task 2: Prisma schema and reproducible migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260907012000_cycle2_crm_core/migration.sql`
- Create: `apps/api/src/crm-core/crm-schema.integration.spec.ts`

**Interfaces:**

- Consumes: `Organization`, `User`, `PrismaService`.
- Produces Prisma models for `Company`, `Contact`, `ContactChannel`, `CompanyContact`, `RelationshipEntry`, `Tag`, `CompanyTag`, `ContactTag`, `CustomFieldDefinition`, `CompanyCustomFieldValue`, `ContactCustomFieldValue`.

- [ ] **Step 1: Write failing integration test**

```ts
const company = await prisma.company.create({
  data: {
    organizationId: orgA.id,
    legalName: "Empresa A",
    createdBy: admin.id,
    updatedBy: admin.id,
  },
});
expect(company.organizationId).toBe(orgA.id);
```

Also assert duplicate `company_contacts` for the same org/company/contact is rejected.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/api test -- crm-schema.integration.spec.ts`
Expected: FAIL because models/tables do not exist.

- [ ] **Step 3: Add enums and models**

```prisma
enum ContactChannelType { EMAIL PHONE MOBILE WHATSAPP OTHER }
enum RelationshipEntryKind { NOTE CALL_NOTE EMAIL_NOTE MEETING_NOTE OTHER }
enum CustomFieldScope { COMPANY CONTACT }
enum CustomFieldType { TEXT NUMBER BOOLEAN DATE SELECT }
```

Add `organizationId` indexes to every business table; use restrictive FKs across primary business relations; use explicit association tables for tags.

- [ ] **Step 4: Add SQL integrity constraints**

```sql
CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL)
```

for `relationship_entries`, plus:

```sql
CREATE UNIQUE INDEX companies_org_document_key
ON companies(organization_id, document)
WHERE document IS NOT NULL AND deleted_at IS NULL;
```

- [ ] **Step 5: Generate Prisma and deploy migration on empty DB**

Run:

```bash
pnpm --filter @axes/api prisma:generate
pnpm --filter @axes/api prisma:migrate:deploy
```

Expected: exit 0.

- [ ] **Step 6: Run GREEN**

Run: `pnpm --filter @axes/api test -- crm-schema.integration.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat(api): add CRM core database model`

---

### Task 3: Empresas API com isolamento e auditoria

**Files:**

- Create: `apps/api/src/companies/companies.module.ts`
- Create: `apps/api/src/companies/companies.controller.ts`
- Create: `apps/api/src/companies/companies.service.ts`
- Create: `apps/api/src/companies/companies.integration.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `AuthenticationGuard`, `PermissionsGuard`, `AuditService`, `PrismaService`, company contracts.
- Produces: list/get/create/update/soft-delete company operations scoped by `organizationId`.

- [ ] **Step 1: Write failing adversarial test**

Scenario:

1. create company A in org A and company B in org B;
2. login org A;
3. `GET /api/v1/companies` returns only A;
4. `GET /api/v1/companies/:companyB` returns 404;
5. `PATCH /api/v1/companies/:companyB` returns 404;
6. company B remains unchanged;
7. VIEWER POST returns 403.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/api test -- companies.integration.spec.ts`
Expected: route not implemented.

- [ ] **Step 3: Implement scoped service**

Every item lookup must include:

```ts
where: {
  id,
  organizationId,
  deletedAt: null,
}
```

List uses `q`, `page`, `limit`, and allowlisted sort fields. Create/update/delete emit audit actions `company.created`, `company.updated`, `company.deleted`.

- [ ] **Step 4: Wire guards**

`GET` requires `company.read`; writes require `company.write`.

- [ ] **Step 5: Run GREEN**

Run: `pnpm --filter @axes/api test -- companies.integration.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat(api): add tenant-scoped companies`

---

### Task 4: Contatos e canais

**Files:**

- Create: `apps/api/src/contacts/contacts.module.ts`
- Create: `apps/api/src/contacts/contacts.controller.ts`
- Create: `apps/api/src/contacts/contacts.service.ts`
- Create: `apps/api/src/contacts/contacts.integration.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: authentication/RBAC/audit/database modules and contact contracts.
- Produces: contact CRUD and channel create/update/delete.

- [ ] **Step 1: Write failing tests**

```ts
await request(server)
  .post("/api/v1/contacts")
  .set("Authorization", bearer)
  .send({ fullName: "Contato sem empresa" })
  .expect(201);
```

Also create EMAIL + MOBILE channels, mark one primary, then attempt org A token against org B contact/channel and expect 404.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/api test -- contacts.integration.spec.ts`
Expected: route not implemented.

- [ ] **Step 3: Implement contact CRUD**

Use the same soft-delete/scoping rules as companies.

- [ ] **Step 4: Implement channels transactionally**

When setting a channel primary for `(contactId, type)`, clear an existing primary of the same type in the same Prisma transaction before setting the requested channel.

- [ ] **Step 5: Audit channel changes**

Use exactly `contact.channel_created`, `contact.channel_updated`, `contact.channel_deleted`.

- [ ] **Step 6: Run GREEN**

Run: `pnpm --filter @axes/api test -- contacts.integration.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat(api): add contacts and channels`

---

### Task 5: Vínculo empresa-contato e histórico

**Files:**

- Create: `apps/api/src/relationships/relationships.module.ts`
- Create: `apps/api/src/relationships/relationships.controller.ts`
- Create: `apps/api/src/relationships/relationships.service.ts`
- Create: `apps/api/src/relationships/relationships.integration.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Produces: link/unlink company-contact and relationship entry create/list operations.

- [ ] **Step 1: Write failing cross-tenant test**

Attempt company org A -> contact org B and assert HTTP 404 plus zero `company_contacts` rows.

- [ ] **Step 2: Write failing history behavior test**

Create `NOTE` with only `companyId`, another with only `contactId`, and reject an entry with neither.

- [ ] **Step 3: Run RED**

Run: `pnpm --filter @axes/api test -- relationships.integration.spec.ts`
Expected: routes not implemented.

- [ ] **Step 4: Implement transactional relationship validation**

Before link/history creation, verify every supplied entity exists with the same `organizationId` and `deletedAt: null`.

- [ ] **Step 5: Audit**

Use exactly `company.contact_linked`, `company.contact_unlinked`, `relationship.created`.

- [ ] **Step 6: Run GREEN**

Run: `pnpm --filter @axes/api test -- relationships.integration.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat(api): add company contact relationships and history`

---

### Task 6: Tags e campos customizáveis

**Files:**

- Create: `apps/api/src/tags/tags.module.ts`
- Create: `apps/api/src/tags/tags.controller.ts`
- Create: `apps/api/src/tags/tags.service.ts`
- Create: `apps/api/src/tags/tags.integration.spec.ts`
- Create: `apps/api/src/custom-fields/custom-fields.module.ts`
- Create: `apps/api/src/custom-fields/custom-fields.controller.ts`
- Create: `apps/api/src/custom-fields/custom-fields.service.ts`
- Create: `apps/api/src/custom-fields/custom-field-value.ts`
- Create: `apps/api/src/custom-fields/custom-field-value.spec.ts`
- Create: `apps/api/src/custom-fields/custom-fields.integration.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Produces tag CRUD/linking and custom-field definitions/values.

- [ ] **Step 1: Write failing tag tests**

Prove normalized uniqueness within an org and allow the same display name in another org. Reject linking org A tag to org B company/contact.

- [ ] **Step 2: Run tag tests RED**

Run: `pnpm --filter @axes/api test -- tags.integration.spec.ts`
Expected: routes/services not implemented.

- [ ] **Step 3: Implement tags and explicit link tables**

Normalize with `trim().toLowerCase()` while preserving display `name`.

- [ ] **Step 4: Write failing custom-field unit tests**

```ts
expect(() => validateCustomFieldValue({ type: "NUMBER" }, "abc")).toThrow();
expect(validateCustomFieldValue({ type: "BOOLEAN" }, true)).toBe(true);
expect(() =>
  validateCustomFieldValue({ type: "SELECT", options: ["A"] }, "B")
).toThrow();
```

- [ ] **Step 5: Run custom-field tests RED**

Run: `pnpm --filter @axes/api test -- custom-field-value.spec.ts custom-fields.integration.spec.ts`
Expected: helper/routes not implemented.

- [ ] **Step 6: Implement centralized validator and API**

`validateCustomFieldValue()` validates primitive type, ISO date string for `DATE`, and membership in `options` for `SELECT`. API verifies definition `organizationId` and `scope` match the target entity before upsert.

- [ ] **Step 7: Audit mutations**

Use `tag.created`, `tag.updated`, `tag.linked`, `tag.unlinked`, `custom_field.created`, `custom_field.updated`, `custom_field.value_set`, `custom_field.value_removed`.

- [ ] **Step 8: Run GREEN**

Run:

```bash
pnpm --filter @axes/api test -- tags.integration.spec.ts
pnpm --filter @axes/api test -- custom-field-value.spec.ts custom-fields.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Commit: `feat(api): add tags and custom fields`

---

### Task 7: App Shell e Empresas Web

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/crm-shell.tsx`
- Create: `apps/web/src/app/companies/companies-view.tsx`
- Create: `apps/web/src/app/companies/companies-view.test.tsx`
- Create: `apps/web/src/lib/api-client.ts`

**Interfaces:**

- Consumes: session response, company contracts, existing login/logout.
- Produces: authenticated shell and company list/create/edit UI.

- [ ] **Step 1: Write failing Web test**

After supplying an authenticated session fixture, assert navigation contains `Empresas` and `Contatos`, and Companies view renders search plus create action.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/web test -- companies-view.test.tsx`
Expected: components do not exist.

- [ ] **Step 3: Extract API client**

Client attaches Bearer access token, `x-request-id`, parses standardized errors, and uses `credentials: "include"` for auth refresh/logout.

- [ ] **Step 4: Implement App Shell and companies UI**

Keep login as unauthenticated state. After authentication render CRM shell; no new routing framework is introduced.

- [ ] **Step 5: Run GREEN**

Run: `pnpm --filter @axes/web test -- companies-view.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat(web): add CRM shell and companies view`

---

### Task 8: Contatos Web e relacionamento

**Files:**

- Create: `apps/web/src/app/contacts/contacts-view.tsx`
- Create: `apps/web/src/app/contacts/contacts-view.test.tsx`
- Create: `apps/web/src/app/shared/tag-editor.tsx`
- Create: `apps/web/src/app/shared/custom-fields-editor.tsx`
- Modify: `apps/web/src/app/crm-shell.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Produces contact list/create/edit, channels, company association, history, tags and custom fields.

- [ ] **Step 1: Write failing UI tests**

Cover contact creation without company, adding channel, linking company, entering history, and rendering controls for `TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `SELECT`.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/web test -- contacts-view.test.tsx`
Expected: components do not exist.

- [ ] **Step 3: Implement minimal accessible controls**

Forms use labels, keyboard-accessible buttons, inline errors and mobile single-column layout.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @axes/web test -- contacts-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(web): add contacts and relationship management`

---

### Task 9: E2E, adversarial coverage, docs and final gate

**Files:**

- Create: `tests/e2e/crm-core.spec.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/testing/README.md`
- Modify: `.github/workflows/ci.yml` only if Cycle 2 data setup requires it without weakening existing gates.

**Interfaces:**

- Produces final Cycle 2 evidence and rollback instructions.

- [ ] **Step 1: Add failing E2E**

Browser journey:

1. login;
2. open Empresas;
3. create `Empresa E2E`;
4. open Contatos;
5. create `Contato E2E` without company;
6. add e-mail channel;
7. link to `Empresa E2E`;
8. create relationship note;
9. reload and verify persisted state.

- [ ] **Step 2: Run E2E RED/GREEN cycle**

Run: `pnpm test:e2e`.
Expected before completion: the new scenario fails at the first missing behavior; after fixes: PASS.

- [ ] **Step 3: Update documentation**

Document migration `20260907012000_cycle2_crm_core`, business routes, Web flow, test strategy and rollback to `v0.1.0-identity-access`.

- [ ] **Step 4: Run the complete fresh gate on one SHA**

```bash
pnpm install --frozen-lockfile
pnpm --filter @axes/api prisma:generate
pnpm --filter @axes/api prisma:migrate:deploy
pnpm verify
pnpm --filter @axes/api bootstrap:admin
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
docker compose config --quiet
docker compose build api web
```

Expected: every command exits 0.

- [ ] **Step 5: Perform final security review**

Verify every item-by-ID query includes `organizationId`; every relationship validates both sides in the same organization; audit metadata excludes secrets; VIEWER writes return 403.

- [ ] **Step 6: Update PR checklist and report**

Do not merge. Present green evidence and wait for post-test approval.

- [ ] **Step 7: Create checkpoint only after green gate**

Create `v0.2.0-crm-core` pointing exactly at the validated SHA. Never move the tag afterward.

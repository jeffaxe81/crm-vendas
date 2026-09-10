# C3.5.1 Activity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fundação persistente tenant-aware de atividades comerciais no CRM canônico, sem API/Web nesta microentrega.

**Architecture:** O domínio será modelado em Prisma/PostgreSQL com uma única tabela `activities`, enums explícitos, relações opcionais com Company/Contact e owner obrigatório. O isolamento será fail-closed via PostgreSQL FORCE RLS usando o mesmo contexto `app.current_organization_id` já adotado na C3.4.

**Tech Stack:** Node.js 24.20.x, pnpm 11.3.0, TypeScript 5.9.3, Prisma, PostgreSQL, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-5-activities-design.md`

## Global Constraints

- Não confiar em `organizationId` vindo do cliente.
- Não criar endpoint REST, tela Web, calendário, recorrência ou automação nesta microentrega.
- Não criar FK de Opportunity enquanto o model canônico não existir na `main`.
- Usar `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` em `activities`.
- A policy RLS deve usar `current_setting('app.current_organization_id', true)`.
- Preservar a arquitetura canônica `apps/api + Prisma/PostgreSQL + apps/web`; não promover tRPC/Manus.
- TDD obrigatório: RED observado antes da implementação GREEN.
- Merge em `main` somente após verificação verde e aprovação explícita.

---

### Task 1: RED de contrato do schema e migration

**Files:**

- Create: `tests/activity-foundation-schema.test.mjs`

**Interfaces:**

- Consumes: `apps/api/prisma/schema.prisma` e diretório `apps/api/prisma/migrations`.
- Produces: contrato executável para os models/enums/índices/RLS esperados.

- [ ] **Step 1: escrever o teste falho**

O teste deve ler `schema.prisma`, localizar uma migration cujo nome contenha `c3_activity_foundation` e afirmar a presença de:

```text
enum ActivityType
enum ActivityStatus
enum ActivityPriority
model Activity
@@map("activities")
activities_org_status_due_idx
activities_org_owner_status_due_idx
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY
CREATE POLICY "activities_tenant_isolation"
current_setting('app.current_organization_id', true)
```

- [ ] **Step 2: executar o teste isolado e confirmar RED**

Run: `node --test tests/activity-foundation-schema.test.mjs`

Expected: FAIL porque `Activity` e a migration ainda não existem.

- [ ] **Step 3: registrar checkpoint RED**

Commit esperado: `test: define C3.5.1 activity foundation contract`.

---

### Task 2: GREEN mínimo do modelo Prisma

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**

- Produces enums `ActivityType`, `ActivityStatus`, `ActivityPriority` e model `Activity`.

- [ ] **Step 1: adicionar enums**

```prisma
enum ActivityType {
  TASK
  APPOINTMENT

  @@map("activity_type")
}

enum ActivityStatus {
  PENDING
  COMPLETED
  CANCELLED

  @@map("activity_status")
}

enum ActivityPriority {
  LOW
  MEDIUM
  HIGH

  @@map("activity_priority")
}
```

- [ ] **Step 2: adicionar relações inversas**

Adicionar às entidades existentes:

```prisma
Organization.activities Activity[]
Company.activities Activity[]
Contact.activities Activity[]
User.activitiesOwned Activity[] @relation("ActivityOwner")
User.activitiesCreated Activity[] @relation("ActivityCreatedBy")
User.activitiesUpdated Activity[] @relation("ActivityUpdatedBy")
User.activitiesDeleted Activity[] @relation("ActivityDeletedBy")
```

- [ ] **Step 3: adicionar model Activity**

```prisma
model Activity {
  id             String           @id @default(uuid()) @db.Uuid
  organizationId String           @map("organization_id") @db.Uuid
  type           ActivityType
  status         ActivityStatus   @default(PENDING)
  priority       ActivityPriority @default(MEDIUM)
  title          String           @db.VarChar(200)
  description    String?
  companyId      String?          @map("company_id") @db.Uuid
  contactId      String?          @map("contact_id") @db.Uuid
  ownerUserId    String           @map("owner_user_id") @db.Uuid
  dueAt          DateTime?        @map("due_at") @db.Timestamptz(6)
  completedAt    DateTime?        @map("completed_at") @db.Timestamptz(6)
  cancelledAt    DateTime?        @map("cancelled_at") @db.Timestamptz(6)
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy      String           @map("created_by") @db.Uuid
  updatedBy      String           @map("updated_by") @db.Uuid
  deletedAt      DateTime?        @map("deleted_at") @db.Timestamptz(6)
  deletedBy      String?          @map("deleted_by") @db.Uuid
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  company        Company?         @relation(fields: [companyId], references: [id], onDelete: Restrict)
  contact        Contact?         @relation(fields: [contactId], references: [id], onDelete: Restrict)
  owner          User             @relation("ActivityOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  creator        User             @relation("ActivityCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  updater        User             @relation("ActivityUpdatedBy", fields: [updatedBy], references: [id], onDelete: Restrict)
  deleter        User?            @relation("ActivityDeletedBy", fields: [deletedBy], references: [id], onDelete: Restrict)

  @@index([organizationId, status, dueAt], map: "activities_org_status_due_idx")
  @@index([organizationId, ownerUserId, status, dueAt], map: "activities_org_owner_status_due_idx")
  @@index([organizationId, companyId], map: "activities_org_company_idx")
  @@index([organizationId, contactId], map: "activities_org_contact_idx")
  @@map("activities")
}
```

- [ ] **Step 4: executar Prisma format/generate em CI**

A validação integral será realizada pelo workflow `verify`; qualquer erro de relação deve ser corrigido antes de seguir.

---

### Task 3: Migration PostgreSQL + FORCE RLS

**Files:**

- Create: `apps/api/prisma/migrations/20260910090000_c3_activity_foundation/migration.sql`

**Interfaces:**

- Consumes: enums/model da Task 2.
- Produces: estruturas SQL e policy tenant-aware fail-closed.

- [ ] **Step 1: criar enums e tabela**

A migration deve criar os três enums PostgreSQL e `activities`, com FKs `RESTRICT` para organization, company, contact e users.

- [ ] **Step 2: criar índices tenant-aware**

Criar:

```sql
CREATE INDEX "activities_org_status_due_idx"
  ON "activities"("organization_id", "status", "due_at");
CREATE INDEX "activities_org_owner_status_due_idx"
  ON "activities"("organization_id", "owner_user_id", "status", "due_at");
CREATE INDEX "activities_org_company_idx"
  ON "activities"("organization_id", "company_id");
CREATE INDEX "activities_org_contact_idx"
  ON "activities"("organization_id", "contact_id");
```

- [ ] **Step 3: habilitar RLS fail-closed**

```sql
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;

CREATE POLICY "activities_tenant_isolation"
ON "activities"
USING (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  "organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid
);
```

- [ ] **Step 4: executar o teste isolado e confirmar GREEN**

Run: `node --test tests/activity-foundation-schema.test.mjs`

Expected: PASS.

---

### Task 4: Gate integral e checkpoint

**Files:**

- Modify: `CHANGELOG.md`
- Create/Modify: `docs/checkpoints/cycle-3-current.md` ou checkpoint equivalente vigente.

**Interfaces:**

- Produces: evidência auditável da microentrega C3.5.1.

- [ ] **Step 1: executar `pnpm verify` via GitHub Actions**

Expected: format, lint, typecheck, repo tests, package tests e build verdes.

- [ ] **Step 2: confirmar check run do SHA candidato**

Não declarar GREEN sem `conclusion=success` no SHA exato.

- [ ] **Step 3: atualizar documentação**

Registrar a fundação Activity, FORCE RLS, ausência deliberada de vínculo Opportunity e itens explicitamente fora do escopo.

- [ ] **Step 4: preparar PR sem merge automático**

Título esperado: `C3.5.1 — Tenant-aware activity foundation`.

O PR deve permanecer aguardando aprovação explícita para merge em `main`.

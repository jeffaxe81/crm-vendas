# C3.6.2 — Opportunity Tenant-Aware API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a API REST tenant-aware de Oportunidades com criação, consulta, edição, movimentação de etapa, soft delete, RBAC, auditoria e concorrência otimista.

**Architecture:** Seguir o monólito modular NestJS já usado em Activities: contratos Zod compartilhados em `@axes/contracts`, controller fino, service de domínio, `PrismaService.withTenant()` em toda operação de dados e `AuditService` para rastreabilidade. Separar edição cadastral (`opportunity.write`) de movimentação de etapa (`opportunity.move`) e usar `version` como CAS para impedir lost updates.

**Tech Stack:** TypeScript, NestJS, Zod, Prisma, PostgreSQL RLS, Vitest/Jest conforme scripts existentes, Supertest, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-6-2-opportunity-api-design.md`

## Global Constraints

- Basear a implementação em `feat/c3-6-2-opportunity-api`, empilhada sobre o head validado da C3.6.1 `40d20a6b11ca8db973cc3fa817801f759aef19bb` enquanto o PR #15 não estiver em `main`.
- `organizationId` nunca vem do payload público; sempre é derivado do principal autenticado.
- Toda leitura/escrita de Opportunity passa por `PrismaService.withTenant()` e preserva a RLS fail-closed da C3.6.1.
- `estimatedValue` é string decimal no contrato público, com até 17 dígitos inteiros e 2 casas decimais; nunca usar `number` como representação externa.
- Exatamente um entre `companyId` e `contactId` deve existir no estado final.
- Pipeline, Stage, cliente e owner precisam pertencer ao mesmo tenant; Pipeline/Stage e cliente precisam estar ativos; owner precisa ter membership ativa.
- `PATCH /opportunities/:id` não altera Pipeline nem Stage.
- `PATCH /opportunities/:id/stage` altera apenas Stage dentro do Pipeline atual.
- PATCH cadastral e movimentação exigem `version` e incrementam a versão atomicamente; stale version retorna `409 OPPORTUNITY_VERSION_CONFLICT`.
- Não criar novas permissões RBAC; usar apenas `opportunity.read`, `opportunity.write` e `opportunity.move`.
- Web/Kanban, troca de Pipeline, Activity -> Opportunity, forecast avançado, multi-moeda, produtos/propostas, comissões, automações, integrações e IA permanecem fora do escopo.

---

## File Structure

- `packages/contracts/src/opportunities.ts`: schemas Zod e tipos públicos de Opportunity.
- `packages/contracts/src/opportunities.test.ts`: testes unitários de contrato, incluindo decimal e XOR.
- `packages/contracts/src/index.ts`: exports públicos do novo contrato.
- `apps/api/src/opportunities/opportunities.controller.ts`: parsing, guards, permissões e endpoints REST.
- `apps/api/src/opportunities/opportunities.service.ts`: regras tenant-aware, referências, CAS/versionamento, serialização e auditoria.
- `apps/api/src/opportunities/opportunities.module.ts`: composição do módulo.
- `apps/api/src/opportunities/opportunities.integration.spec.ts`: lifecycle, RBAC, cross-tenant, referências, versionamento e auditoria.
- `apps/api/src/app.module.ts`: registro de `OpportunitiesModule`.
- `CHANGELOG.md`: registro da microentrega.
- `docs/checkpoints/c3-6-2-opportunity-api.md`: evidências TDD/CI e limites do escopo.

---

### Task 1: Public Opportunity Contracts

**Files:**

- Create: `packages/contracts/src/opportunities.ts`
- Create: `packages/contracts/src/opportunities.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces: `OpportunityCreateInputSchema`, `OpportunityUpdateInputSchema`, `OpportunityMoveInputSchema`, `OpportunityListQuerySchema` e seus tipos inferidos.
- Consumes: `PaginationQuerySchema` de `packages/contracts/src/companies.ts`.

- [ ] **Step 1: Write failing contract tests**

Criar testes que provem:

```ts
expect(
  OpportunityCreateInputSchema.safeParse({
    pipelineId: uuidA,
    stageId: uuidB,
    companyId: uuidC,
    ownerUserId: uuidD,
    title: "Renovação anual",
    estimatedValue: "1250.50",
  }).success
).toBe(true);

expect(
  OpportunityCreateInputSchema.safeParse({
    pipelineId: uuidA,
    stageId: uuidB,
    companyId: uuidC,
    contactId: uuidE,
    ownerUserId: uuidD,
    title: "Inválida",
    estimatedValue: "10.00",
  }).success
).toBe(false);

expect(
  OpportunityCreateInputSchema.safeParse({
    pipelineId: uuidA,
    stageId: uuidB,
    ownerUserId: uuidD,
    title: "Sem cliente",
    estimatedValue: "10.00",
  }).success
).toBe(false);

expect(
  OpportunityCreateInputSchema.safeParse({
    pipelineId: uuidA,
    stageId: uuidB,
    companyId: uuidC,
    ownerUserId: uuidD,
    title: "Valor inválido",
    estimatedValue: "0.001",
  }).success
).toBe(false);

expect(OpportunityUpdateInputSchema.safeParse({ version: 2 }).success).toBe(
  false
);
expect(
  OpportunityMoveInputSchema.parse({ stageId: uuidB, version: 2 })
).toEqual({ stageId: uuidB, version: 2 });
```

- [ ] **Step 2: Run contract tests and confirm RED**

Run: `pnpm --filter @axes/contracts test -- opportunities.test.ts`

Expected: FAIL porque `./opportunities` e seus exports ainda não existem.

- [ ] **Step 3: Implement minimal contract**

Criar em `opportunities.ts`:

```ts
import { z } from "zod";
import { PaginationQuerySchema } from "./companies";

const OpportunityDateTimeSchema = z.string().datetime({ offset: true });
export const OpportunityDecimalSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,16})(\.\d{1,2})?$/,
    "Informe um valor decimal não negativo com até 17 dígitos inteiros e 2 casas decimais."
  );

const customerFields = {
  companyId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
};

export const OpportunityCreateInputSchema = z
  .object({
    pipelineId: z.string().uuid(),
    stageId: z.string().uuid(),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    ownerUserId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    estimatedValue: OpportunityDecimalSchema,
    expectedCloseAt: OpportunityDateTimeSchema.optional(),
    notes: z.string().trim().max(10_000).optional(),
  })
  .refine(
    value =>
      Number(Boolean(value.companyId)) + Number(Boolean(value.contactId)) === 1,
    {
      message: "Informe exatamente um cliente: companyId ou contactId.",
    }
  );

export const OpportunityUpdateInputSchema = z
  .object({
    ...customerFields,
    ownerUserId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    estimatedValue: OpportunityDecimalSchema.optional(),
    expectedCloseAt: OpportunityDateTimeSchema.nullable().optional(),
    notes: z.string().trim().max(10_000).nullable().optional(),
    version: z.number().int().min(1),
  })
  .refine(
    value =>
      Object.entries(value).some(
        ([key, item]) => key !== "version" && item !== undefined
      ),
    {
      message: "Informe ao menos uma alteração além de version.",
    }
  );

export const OpportunityMoveInputSchema = z.object({
  stageId: z.string().uuid(),
  version: z.number().int().min(1),
});

export const OpportunityListQuerySchema = PaginationQuerySchema.extend({
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  expectedCloseFrom: OpportunityDateTimeSchema.optional(),
  expectedCloseTo: OpportunityDateTimeSchema.optional(),
  sortBy: z
    .enum(["updatedAt", "createdAt", "expectedCloseAt", "estimatedValue"])
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type OpportunityCreateInput = z.infer<
  typeof OpportunityCreateInputSchema
>;
export type OpportunityUpdateInput = z.infer<
  typeof OpportunityUpdateInputSchema
>;
export type OpportunityMoveInput = z.infer<typeof OpportunityMoveInputSchema>;
export type OpportunityListQuery = z.infer<typeof OpportunityListQuerySchema>;
```

Exportar os schemas/tipos por `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run contract tests and verify GREEN**

Run: `pnpm --filter @axes/contracts test -- opportunities.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/opportunities.ts packages/contracts/src/opportunities.test.ts packages/contracts/src/index.ts
git commit -m "feat: add C3.6.2 opportunity API contracts"
```

---

### Task 2: Create, Read and List Opportunity API

**Files:**

- Create: `apps/api/src/opportunities/opportunities.integration.spec.ts`
- Create: `apps/api/src/opportunities/opportunities.controller.ts`
- Create: `apps/api/src/opportunities/opportunities.service.ts`
- Create: `apps/api/src/opportunities/opportunities.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Produces: `OpportunitiesService.list(query, organizationId)`, `read(id, organizationId)`, `create(input, context)`.
- Produces REST: `GET /api/v1/opportunities`, `GET /api/v1/opportunities/:id`, `POST /api/v1/opportunities`.
- Context: `{ organizationId: string; actorUserId: string; requestId: string; ipAddress?: string | null }`.

- [ ] **Step 1: Write lifecycle integration test first**

Seedar Organization, ADMIN, membership ativa, Pipeline ativo, Stage ativa, Company ativa e autenticar. O primeiro teste deve executar:

```ts
const created = await request(app.getHttpServer())
  .post("/api/v1/opportunities")
  .set("Authorization", `Bearer ${token}`)
  .send({
    pipelineId: pipeline.id,
    stageId: stage.id,
    companyId: company.id,
    ownerUserId: user.id,
    title: "Contrato Enterprise",
    estimatedValue: "150000.00",
  })
  .expect(201);

expect(created.body).toMatchObject({
  organizationId: organization.id,
  pipelineId: pipeline.id,
  stageId: stage.id,
  companyId: company.id,
  contactId: null,
  ownerUserId: user.id,
  title: "Contrato Enterprise",
  estimatedValue: "150000.00",
  version: 1,
});
```

Depois validar `GET /opportunities/:id` e `GET /opportunities?q=Enterprise&pipelineId=...`.

- [ ] **Step 2: Run integration test and confirm RED**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: FAIL com 404 no POST porque o módulo/controller ainda não existem.

- [ ] **Step 3: Implement minimal module/controller/service**

Controller deve usar `AuthenticationGuard`, `PermissionsGuard` e:

```ts
@Get() @RequirePermissions("opportunity.read")
@Get(":id") @RequirePermissions("opportunity.read")
@Post() @RequirePermissions("opportunity.write")
```

Service deve:

```ts
async create(input: OpportunityCreateInput, context: OpportunityAdministrationContext) {
  const opportunity = await this.prisma.withTenant(context.organizationId, async tenant => {
    await this.validateCreateReferences(tenant, input, context.organizationId);
    return tenant.opportunity.create({
      data: {
        organizationId: context.organizationId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        ownerUserId: input.ownerUserId,
        title: input.title,
        estimatedValue: new Prisma.Decimal(input.estimatedValue),
        expectedCloseAt: input.expectedCloseAt ? new Date(input.expectedCloseAt) : null,
        notes: input.notes ?? null,
        createdBy: context.actorUserId,
        updatedBy: context.actorUserId,
      },
    });
  });
  await this.recordCreated(opportunity, context);
  return this.toPublicOpportunity(opportunity);
}
```

`validateCreateReferences` deve confirmar Pipeline ativo, Stage ativa vinculada ao Pipeline, cliente ativo e membership ativa do owner; qualquer falha retorna `404 OPPORTUNITY_REFERENCE_NOT_FOUND`.

`read` e `list` devem filtrar `organizationId` + `deletedAt: null`; cross-tenant permanece 404 por `requireOpportunity`.

`toPublicOpportunity()` deve serializar `estimatedValue` com `toFixed(2)` e datas como os valores retornáveis já aceitos pelo Nest.

Registrar `OpportunitiesModule` em `AppModule`.

- [ ] **Step 4: Run integration test and verify GREEN**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: PASS para create/read/list.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/opportunities apps/api/src/app.module.ts
git commit -m "feat: add tenant-aware opportunity create read list API"
```

---

### Task 3: Update With Final-State Validation and Optimistic Versioning

**Files:**

- Modify: `apps/api/src/opportunities/opportunities.integration.spec.ts`
- Modify: `apps/api/src/opportunities/opportunities.controller.ts`
- Modify: `apps/api/src/opportunities/opportunities.service.ts`

**Interfaces:**

- Produces REST: `PATCH /api/v1/opportunities/:id` with `opportunity.write`.
- Produces: `OpportunitiesService.update(id, input, context)`.

- [ ] **Step 1: Add failing update tests**

Cobrir: edição válida, Company -> Contact no mesmo patch, stale version, cliente cross-tenant, owner sem membership ativa e tentativa de enviar `stageId`/`pipelineId` rejeitada pelo schema.

Teste central:

```ts
const updated = await request(app.getHttpServer())
  .patch(`/api/v1/opportunities/${id}`)
  .set("Authorization", `Bearer ${token}`)
  .send({ title: "Contrato revisado", estimatedValue: "175000.25", version: 1 })
  .expect(200);

expect(updated.body.version).toBe(2);

await request(app.getHttpServer())
  .patch(`/api/v1/opportunities/${id}`)
  .set("Authorization", `Bearer ${token}`)
  .send({ title: "Stale", version: 1 })
  .expect(409);
```

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: FAIL porque PATCH ainda não existe.

- [ ] **Step 3: Implement update CAS**

Fluxo dentro de `withTenant()`:

```ts
const existing = await this.requireOpportunity(
  tenant,
  id,
  context.organizationId
);
const finalCompanyId =
  input.companyId !== undefined ? input.companyId : existing.companyId;
const finalContactId =
  input.contactId !== undefined ? input.contactId : existing.contactId;
if (Number(Boolean(finalCompanyId)) + Number(Boolean(finalContactId)) !== 1) {
  throw new BadRequestException({
    code: "VALIDATION_ERROR",
    message: "A oportunidade deve possuir exatamente um cliente.",
  });
}
await this.validateMutableReferences(
  tenant,
  { ...input, companyId: finalCompanyId, contactId: finalContactId },
  context.organizationId
);
const result = await tenant.opportunity.updateMany({
  where: {
    id,
    organizationId: context.organizationId,
    deletedAt: null,
    version: input.version,
  },
  data: {
    ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
    ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
    ...(input.ownerUserId !== undefined
      ? { ownerUserId: input.ownerUserId }
      : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.estimatedValue !== undefined
      ? { estimatedValue: new Prisma.Decimal(input.estimatedValue) }
      : {}),
    ...(input.expectedCloseAt !== undefined
      ? {
          expectedCloseAt: input.expectedCloseAt
            ? new Date(input.expectedCloseAt)
            : null,
        }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    updatedBy: context.actorUserId,
    version: { increment: 1 },
  },
});
if (result.count === 0) this.versionConflict();
const updated = await this.requireOpportunity(
  tenant,
  id,
  context.organizationId
);
```

Auditar `opportunity.updated` com before/after e versões.

- [ ] **Step 4: Run integration test and verify GREEN**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/opportunities
git commit -m "feat: add opportunity optimistic update"
```

---

### Task 4: Dedicated Stage Movement

**Files:**

- Modify: `apps/api/src/opportunities/opportunities.integration.spec.ts`
- Modify: `apps/api/src/opportunities/opportunities.controller.ts`
- Modify: `apps/api/src/opportunities/opportunities.service.ts`

**Interfaces:**

- Produces REST: `PATCH /api/v1/opportunities/:id/stage` with `opportunity.move`.
- Produces: `OpportunitiesService.moveStage(id, input, context)`.

- [ ] **Step 1: Add failing movement tests**

Criar duas Stages ativas no mesmo Pipeline e outra Stage em Pipeline diferente. Provar:

```ts
const moved = await request(app.getHttpServer())
  .patch(`/api/v1/opportunities/${id}/stage`)
  .set("Authorization", `Bearer ${token}`)
  .send({ stageId: secondStage.id, version: 1 })
  .expect(200);
expect(moved.body.stageId).toBe(secondStage.id);
expect(moved.body.version).toBe(2);
```

Depois esperar 404 de referência para Stage de outro Pipeline e 409 para versão stale.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: FAIL porque `/stage` ainda não existe.

- [ ] **Step 3: Implement moveStage**

Validar destino com:

```ts
const stage = await tenant.pipelineStage.findFirst({
  where: {
    id: input.stageId,
    organizationId: context.organizationId,
    pipelineId: existing.pipelineId,
    isActive: true,
  },
  select: { id: true, kind: true },
});
if (!stage) this.referenceNotFound();
```

Executar `updateMany` condicionado por `id`, tenant, `deletedAt: null` e `version`; setar `stageId`, `updatedBy` e `version: { increment: 1 }`. Zero linhas após leitura válida => `409 OPPORTUNITY_VERSION_CONFLICT`.

Auditar `opportunity.moved` com `pipelineId`, `fromStageId`, `toStageId`, `fromVersion`, `toVersion`.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/opportunities
git commit -m "feat: add controlled opportunity stage movement"
```

---

### Task 5: Soft Delete, RBAC, Cross-Tenant and Audit Boundaries

**Files:**

- Modify: `apps/api/src/opportunities/opportunities.integration.spec.ts`
- Modify: `apps/api/src/opportunities/opportunities.controller.ts`
- Modify: `apps/api/src/opportunities/opportunities.service.ts`

**Interfaces:**

- Produces REST: `DELETE /api/v1/opportunities/:id` with `opportunity.write`.
- Preserves existing RBAC map without changes to `permissions.ts`.

- [ ] **Step 1: Add failing adversarial tests**

Cobrir no mesmo suite:

```ts
await request(app.getHttpServer())
  .delete(`/api/v1/opportunities/${id}`)
  .set("Authorization", `Bearer ${sellerToken}`)
  .expect(204);

await request(app.getHttpServer())
  .get(`/api/v1/opportunities/${id}`)
  .set("Authorization", `Bearer ${sellerToken}`)
  .expect(404);
```

Também provar:

- VIEWER: GET 200, POST/PATCH/stage/DELETE 403;
- SELLER: create/update/move/delete permitido;
- tenant A lendo/alterando ID de B recebe 404;
- Company/Contact cross-tenant retorna 404 de referência;
- owner sem membership ativa retorna 404 de referência;
- Pipeline/Stage inativo retorna 404 de referência;
- AuditLog contém `opportunity.created`, `opportunity.updated`, `opportunity.moved`, `opportunity.deleted` com ator, requestId, entityId e versões.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: FAIL pelo DELETE ausente e/ou assertions adversariais ainda não satisfeitas.

- [ ] **Step 3: Implement soft delete and close validation gaps**

Controller:

```ts
@Delete(":id")
@HttpCode(204)
@RequirePermissions("opportunity.write")
async remove(...) { await this.opportunities.remove(...); }
```

Service, dentro de `withTenant()`:

```ts
const existing = await this.requireOpportunity(
  tenant,
  id,
  context.organizationId
);
const deletedAt = new Date();
const updated = await tenant.opportunity.update({
  where: { id: existing.id },
  data: {
    deletedAt,
    deletedBy: context.actorUserId,
    updatedBy: context.actorUserId,
    version: { increment: 1 },
  },
});
```

Auditar `opportunity.deleted`. Não alterar o mapa de permissões já existente.

- [ ] **Step 4: Run focused API test and verify GREEN**

Run: `pnpm --filter @axes/api test -- opportunities.integration.spec.ts`

Expected: PASS de todos os casos C3.6.2.

- [ ] **Step 5: Run broader API tests**

Run: `pnpm --filter @axes/api test`

Expected: PASS sem regressões.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/opportunities
git commit -m "test: harden opportunity tenant RBAC audit boundaries"
```

---

### Task 6: Documentation and Final Verification

**Files:**

- Modify: `CHANGELOG.md`
- Create: `docs/checkpoints/c3-6-2-opportunity-api.md`
- Modify: PR #17 body after final evidence is known.

**Interfaces:**

- Produces: checkpoint reproduzível com heads, runs, escopo entregue e exclusões.

- [ ] **Step 1: Update changelog**

Registrar C3.6.2 com endpoints, tenant isolation, decimal string, CAS/version, RBAC e auditoria; afirmar explicitamente que Web/Kanban, troca de Pipeline e Activity -> Opportunity continuam fora do escopo.

- [ ] **Step 2: Run complete local verification**

Run: `pnpm verify`

Expected: PASS em format, lint, typecheck, tests e build conforme scripts do repositório.

- [ ] **Step 3: Commit documentation**

```bash
git add CHANGELOG.md docs/checkpoints/c3-6-2-opportunity-api.md
git commit -m "docs: checkpoint C3.6.2 opportunity API"
```

- [ ] **Step 4: Verify definitive GitHub Actions head**

No workflow do head definitivo, exigir conclusão GREEN para instalação congelada, Prisma generate/migrations, source/tests, E2E, Compose contract e image builds, nos mesmos gates usados nas microentregas anteriores.

- [ ] **Step 5: Update PR #17 evidence**

Atualizar o body com:

- SHA do RED inicial;
- SHA e run GREEN de cada fatia relevante;
- SHA final;
- workflow final GREEN;
- arquivos alterados;
- exclusões de escopo;
- aviso: merge bloqueado até aprovação humana explícita.

- [ ] **Step 6: Human merge gate**

Não marcar ready/mergear automaticamente. Apresentar ao responsável o head definitivo e a evidência GREEN. Somente executar merge após aprovação explícita e nova verificação do mesmo head.

# C3.6.3 Activity -> Opportunity Link Implementation Plan

> **Execution:** seguir TDD estrito, task por task, mantendo a branch isolada e os gates do Prompt Master.

**Goal:** Permitir que uma `Activity` seja opcionalmente vinculada a uma `Opportunity` do mesmo tenant, com integridade referencial no banco, contratos públicos, filtros, RBAC e auditoria preservados.

**Architecture:** O vínculo será 0..1 `Opportunity` por `Activity` e 0..N `Activities` por `Opportunity`, persistido por `opportunityId` nullable em `Activity`. A FK será composta por `opportunityId + organizationId`, apontando para `Opportunity(id, organizationId)`, para impedir vínculo cross-tenant também no banco. A API existente de Activities será estendida; nenhum endpoint novo será criado.

**Tech Stack:** TypeScript, NestJS, Prisma, PostgreSQL, Zod, Jest/Supertest, pnpm, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-6-3-activity-opportunity-link-design.md`

## Execution checkpoint — 2026-09-10

- Design: aprovado em conversa.
- C3.6.2 base: `515a527a4dd710bd8a4b3e2116f1829c509d0561`.
- Branch: `feat/c3-6-3-activity-opportunity`.
- Task 1A RED: preparada, mas ainda não observada no repositório real no início desta execução.
- GREEN 1A: bloqueado até RED funcional real.
- Nenhum código de produção da C3.6.3 deve ser criado/aplicado antes desse RED.

## Global Constraints

- `organizationId` vem exclusivamente do principal autenticado; nunca de body/query/path como fonte de confiança.
- Toda validação de referências permanece dentro de `PrismaService.withTenant(organizationId, ...)`.
- `Activity.opportunityId` é opcional e nullable.
- `POST /api/v1/activities`: `opportunityId` opcional.
- `PATCH /api/v1/activities/:id`: UUID vincula/troca; `null` desvincula; campo ausente preserva vínculo.
- `GET /api/v1/activities`: filtro opcional `opportunityId`.
- `GET /api/v1/activities/:id`: retorna `opportunityId` no registro.
- Opportunity inexistente, soft-deleted ou cross-tenant usada como nova referência retorna `404 ACTIVITY_REFERENCE_NOT_FOUND`.
- Vínculo existente não é removido automaticamente quando a Opportunity é posteriormente soft-deleted.
- Company, Contact e Opportunity continuam referências contextuais independentes da Activity.
- Não criar permissões novas; usar `activity.read` e `activity.write` existentes.
- Não criar eventos `activity.linked`/`activity.unlinked`; snapshots existentes passam a incluir `opportunityId`.
- Não criar `GET /opportunities/:id/activities`; usar `GET /activities?opportunityId=...`.
- Não incluir Web/Kanban, timeline unificada, automações, IA, many-to-many ou coerência obrigatória Company/Contact x Opportunity.
- TDD estrito: nenhum código de produção antes de um RED funcional observado para a fatia.
- Falha de formatter, bootstrap, dependência, infraestrutura ou helper de teste não vale como RED funcional; corrigir o harness e repetir.
- Cada task termina com GREEN e commit separado.
- Nenhum merge em `main` sem workflow final GREEN no head exato e aprovação humana explícita.

## File Map

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260910_c3_6_3_activity_opportunity_column/migration.sql`
- `apps/api/prisma/migrations/20260910_c3_6_3_activity_opportunity_tenant_fk/migration.sql`
- `packages/contracts/src/activities.ts`
- `packages/contracts/src/activities.test.ts`
- `apps/api/src/activities/activities.service.ts`
- `apps/api/src/activities/activities.integration.spec.ts`
- `CHANGELOG.md`
- `docs/checkpoints/c3-6-3-activity-opportunity-link.md`

`apps/api/src/activities/activities.controller.ts` não deve mudar salvo necessidade demonstrada por teste: os endpoints atuais já delegam parsing aos schemas compartilhados e usam o RBAC correto.

---

## Task 1: Persistência tenant-aware do vínculo

### Ciclo A — persistência básica same-tenant

1. **RED:** adicionar um único teste em `activities.integration.spec.ts` que cria Organization, membership, Pipeline, Stage, Company e Opportunity do mesmo tenant e tenta persistir uma Activity com `opportunityId` via `PrismaService.withTenant()`.
2. Executar `pnpm verify` e aceitar o RED somente se a causa for ausência de suporte persistente a `Activity.opportunityId`.
3. **GREEN mínimo:** adicionar somente o campo escalar nullable em Activity e o índice `(organizationId, opportunityId)`; criar migration que adiciona `opportunity_id UUID` e o índice.
4. Não criar a FK composta ainda.
5. Executar `pnpm verify` e exigir regressão completa GREEN.
6. Commit: `feat(crm): persist activity opportunity id`.

Modelo mínimo do GREEN A:

```prisma
opportunityId String? @map("opportunity_id") @db.Uuid
@@index([organizationId, opportunityId], map: "activities_org_opportunity_idx")
```

Migration:

```sql
ALTER TABLE "activities" ADD COLUMN "opportunity_id" UUID;
CREATE INDEX "activities_org_opportunity_idx"
  ON "activities"("organization_id", "opportunity_id");
```

### Ciclo B — integridade cross-tenant no banco

1. **RED:** Organization A tenta criar Activity apontando para Opportunity B e o teste exige erro Prisma `P2003`. Após o Ciclo A, sem FK composta, a operação deve ser indevidamente aceita e o teste deve falhar por ausência da proteção.
2. Executar `pnpm verify` e confirmar esse RED funcional.
3. **GREEN:** transformar o campo em relação tenant-aware composta:

```prisma
opportunityId String?      @map("opportunity_id") @db.Uuid
opportunity   Opportunity? @relation(fields: [opportunityId, organizationId], references: [id, organizationId], onDelete: Restrict)
```

4. Em Opportunity adicionar `activities Activity[]` e `@@unique([id, organizationId], map: "opportunities_id_organization_key")`.
5. Criar migration com unique composta em Opportunities e FK `(opportunity_id, organization_id)` -> `(id, organization_id)` com `ON DELETE RESTRICT` e `ON UPDATE CASCADE`.
6. Rodar `pnpm verify` e exigir GREEN completo.
7. Commit: `feat(crm): enforce tenant-aware activity opportunity relation`.

---

## Task 2: Contratos públicos de Activities

1. **RED:** testes explícitos para:
   - create aceita `opportunityId` UUID opcional;
   - update aceita UUID ou `null`;
   - update sem campo não cria `opportunityId`;
   - list query aceita filtro UUID;
   - UUID inválido é rejeitado.
2. Rodar `pnpm verify` e confirmar RED funcional dos schemas.
3. **GREEN:** adicionar:

```ts
// create
opportunityId: z.string().uuid().optional(),
// update
opportunityId: z.string().uuid().nullable().optional(),
// list
opportunityId: z.string().uuid().optional(),
```

4. Não alterar semântica adicional nem criar novo refine desnecessário.
5. Rodar `pnpm verify` GREEN.
6. Commit: `feat(crm): expose opportunity link in activity contracts`.

---

## Task 3: Create, Read e List com opportunityId

1. **RED:** criar Opportunity válida e provar via API:
   - POST Activity com `opportunityId` retorna o vínculo;
   - GET por id retorna o vínculo;
   - GET list com `?opportunityId=` retorna somente vinculadas;
   - Activity sem Opportunity continua válida e não aparece no filtro.
2. Rodar `pnpm verify` e confirmar falha pelo service ainda não persistir/filtrar.
3. **GREEN mínimo:** no `ActivitiesService`:
   - incluir `opportunityId` no tipo auditável;
   - filtrar por `opportunityId` em `list()`;
   - persistir `opportunityId` em create;
   - ampliar `validateReferences()` para validar Opportunity ativa no mesmo tenant;
   - incluir `opportunityId` em `toAuditActivity()`.
4. Referência inválida/cross-tenant/deleted deve usar `ACTIVITY_REFERENCE_NOT_FOUND`.
5. Rodar `pnpm verify` GREEN.
6. Commit: `feat(crm): create and filter activities by opportunity`.

---

## Task 4: PATCH para vincular, trocar e desvincular

1. **REDs separados:**
   - Activity sem vínculo -> Opportunity A;
   - Opportunity A -> Opportunity B;
   - UUID -> `null` remove vínculo;
   - PATCH sem `opportunityId` preserva vínculo.
2. Rodar `pnpm verify` e confirmar RED funcional.
3. **GREEN mínimo:** no `tenant.activity.update()` escrever `opportunityId` somente se `input.opportunityId !== undefined`; `null` deve persistir desvinculação.
4. Validar UUID não-null pelo mesmo `validateReferences()` antes do update.
5. Provar auditoria `activity.updated` com `before/after` incluindo `opportunityId` para swap e unlink.
6. Rodar `pnpm verify` GREEN.
7. Commit: `feat(crm): update activity opportunity links`.

---

## Task 5: Limites adversariais — cross-tenant, soft delete e RBAC

Cobertura obrigatória:

1. create com Opportunity cross-tenant -> `404 ACTIVITY_REFERENCE_NOT_FOUND`;
2. update com Opportunity cross-tenant -> mesmo 404 genérico;
3. Opportunity soft-deleted não pode ser nova referência;
4. Activity já vinculada continua retornando o `opportunityId` se a Opportunity for soft-deleted depois;
5. VIEWER pode ler Activity, mas PATCH do vínculo retorna 403;
6. SELLER pode criar/alterar vínculo conforme `activity.write`;
7. FK composta rejeita relação cross-tenant direta no banco;
8. auditoria contém `opportunityId` nos snapshots;
9. listagem de tenant A não retorna Activity do tenant B.

Se algum desses comportamentos já estiver GREEN por implementação anterior, manter como cobertura e seguir; não fabricar RED artificial.

Rodar `pnpm verify`. Alterar somente o service se os testes revelarem lacuna funcional real. Não criar nova permissão, endpoint ou regra Company/Contact.

Commit: `test(crm): harden activity opportunity tenant boundaries`.

---

## Task 6: Documentação, checkpoint, PR Draft e gate final

### Changelog

Registrar somente:

- Activity pode ser vinculada opcionalmente a uma Opportunity do mesmo tenant.
- Create/update/list de Activities suportam `opportunityId`.
- FK composta impede vínculo cross-tenant no banco.
- Opportunity soft-deleted não pode ser nova referência; vínculo histórico existente é preservado.
- Auditoria existente passa a registrar `opportunityId` nos snapshots.

### Checkpoint

Criar `docs/checkpoints/c3-6-3-activity-opportunity-link.md` sem placeholders, contendo:

- escopo;
- contratos;
- persistência e FK composta;
- segurança/RBAC;
- evidência TDD por Task com SHA e RED/GREEN reais;
- head final e workflow final;
- resultado de `pnpm verify`, E2E, Compose e builds;
- gate humano de merge.

### Verificação final

Executar no mesmo candidato:

```bash
pnpm verify
pnpm test:e2e
docker compose config --quiet
docker compose build api web
```

Todos devem terminar com exit 0.

### PR e workflow

- PR real: #29, Draft contra `main`.
- Atualizar body com escopo, arquivos, evidências RED/GREEN, exclusões e proibição de merge automático.
- Confirmar GitHub Actions no SHA final para instalação locked/supply-chain, Prisma generate, migrations, provisionamento do role da aplicação, `pnpm verify`, bootstrap E2E, Chromium, E2E, Compose e builds Docker.

### Gate humano final

Após confirmar head exato, PR mergeável e workflow final GREEN, parar. Não marcar ready nem mergear até autorização explícita equivalente a:

`Aprovo o merge do PR #29 na main.`

---

## Self-Review do Plano

- Cobertura: persistência, contratos, create/read/list, patch link/swap/unlink, cross-tenant, soft-delete, RBAC, auditoria, regressão, documentação e gate final possuem etapa explícita.
- Escopo: nenhuma UI, Kanban, timeline, automação, IA, many-to-many ou nova permissão foi incluída.
- Tipos: `opportunityId` é `string | undefined` no create/list, `string | null | undefined` no update e `string | null` na persistência.
- Segurança: validação de aplicação usa `withTenant()` e a FK composta garante barreira estrutural adicional.
- TDD: cada alteração funcional possui RED antes de produção; falha de infraestrutura/formatter não é aceita como RED.
- Versionamento: commits separados por microentrega e merge final condicionado a GREEN + aprovação humana explícita.

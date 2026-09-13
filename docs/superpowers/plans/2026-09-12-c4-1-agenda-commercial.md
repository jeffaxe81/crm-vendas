# C4.1 Agenda Comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma Agenda Comercial semanal baseada no domínio `Activity`, sem novo armazenamento ou endpoint, com validação coerente da janela temporal e navegação Web protegida por `activity.read`.

**Architecture:** A Agenda é uma projeção de leitura de `Activity`. O browser calcula uma janela semanal e consulta `GET /api/v1/activities` com `dueFrom`, `dueTo`, filtros opcionais e ordenação por `dueAt`; a API reutiliza o tenant do principal autenticado e o RLS existente. A UI agrupa o resultado por dia e não cria/edita atividades inline nesta versão.

**Tech Stack:** Node 24.20.x, pnpm 11.3.0, TypeScript 5.9, Zod 4.1, NestJS, Prisma/PostgreSQL, Next.js 16.3, React 19.2, Vitest 4.1, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-c4-1-agenda-commercial-design.md`

## Global Constraints

- Não criar nova tabela, migration ou entidade `CalendarEvent`.
- Não criar endpoint `/agenda`; usar `GET /api/v1/activities`.
- Reutilizar exclusivamente `activity.read` para acesso à Agenda.
- Tenant deriva somente do principal autenticado.
- Manter `dueFrom` e `dueTo` como ISO 8601 com offset.
- Não implementar recorrência, lembretes, drag-and-drop, integração externa, automação ou IA.
- Toda alteração de comportamento começa com teste RED observado no CI antes do GREEN correspondente.

---

### Task 1: C4.1.1 — Coerência da janela temporal

**Files:**
- Modify: `packages/contracts/src/activities.test.ts`
- Modify: `packages/contracts/src/activities.ts`

**Interfaces:**
- Consumes: `ActivityListQuerySchema` existente.
- Produces: `ActivityListQuerySchema.safeParse()` rejeita quando `dueFrom` representa instante posterior a `dueTo`.

- [ ] **Step 1: Write the failing contract test**

Adicionar em `packages/contracts/src/activities.test.ts` um teste isolado equivalente a:

```ts
it("rejects an inverted activity due window", () => {
  const parsed = ActivityListQuerySchema.safeParse({
    dueFrom: "2026-09-14T18:00:00-03:00",
    dueTo: "2026-09-14T09:00:00-03:00",
  });

  expect(parsed.success).toBe(false);
});
```

Adicionar também um teste de offsets diferentes que representam instantes válidos, para garantir que a comparação seja temporal e não lexicográfica:

```ts
it("accepts an ordered due window across different offsets", () => {
  const parsed = ActivityListQuerySchema.safeParse({
    dueFrom: "2026-09-14T09:00:00-03:00",
    dueTo: "2026-09-14T13:00:00-02:00",
  });

  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @axes/contracts test -- activities.test.ts
```

Expected: o caso `rejects an inverted activity due window` falha porque o schema atual valida cada datetime isoladamente, mas não compara os dois limites.

- [ ] **Step 3: Implement minimal validation**

Alterar somente `ActivityListQuerySchema` em `packages/contracts/src/activities.ts` para adicionar `superRefine` após o `extend`:

```ts
export const ActivityListQuerySchema = PaginationQuerySchema.extend({
  type: ActivityTypeSchema.optional(),
  status: ActivityStatusSchema.optional(),
  priority: ActivityPrioritySchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  dueFrom: ActivityDateTimeSchema.optional(),
  dueTo: ActivityDateTimeSchema.optional(),
  sortBy: z.enum(["dueAt", "createdAt", "updatedAt", "title"]).default("dueAt"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
}).superRefine((value, context) => {
  if (
    value.dueFrom &&
    value.dueTo &&
    new Date(value.dueFrom).getTime() > new Date(value.dueTo).getTime()
  ) {
    context.addIssue({
      code: "custom",
      path: ["dueTo"],
      message: "dueTo deve ser igual ou posterior a dueFrom.",
    });
  }
});
```

- [ ] **Step 4: Run GREEN and contract regression**

Run:

```bash
pnpm --filter @axes/contracts test -- activities.test.ts
pnpm --filter @axes/contracts typecheck
```

Expected: ambos passam.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/activities.ts packages/contracts/src/activities.test.ts
git commit -m "feat(crm): validate activity agenda window"
```

---

### Task 2: C4.1.1 — API respects the Agenda window and tenant boundary

**Files:**
- Modify: `apps/api/src/activities/activities.integration.spec.ts`
- No production service change expected unless the failing test exposes a defect.

**Interfaces:**
- Consumes: `GET /api/v1/activities?dueFrom=...&dueTo=...&sortBy=dueAt&sortOrder=asc`.
- Produces: resultado limitado à janela solicitada, somente do tenant autenticado, em ordem cronológica.

- [ ] **Step 1: Add integration coverage**

Criar cenário com três atividades do tenant A (antes, dentro e depois da janela) e uma atividade do tenant B dentro da mesma janela. Consultar como tenant A e afirmar:

```ts
expect(response.status).toBe(200);
expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
  "Dentro da janela 1",
  "Dentro da janela 2",
]);
```

O fixture deve usar `dueAt` distintos para provar ordenação ascendente e nunca deve depender de dados globais compartilhados entre testes.

- [ ] **Step 2: Run the targeted integration test**

Run:

```bash
pnpm --filter @axes/api test -- activities.integration.spec.ts
```

Expected: GREEN se o comportamento existente já satisfizer integralmente o contrato. Se ficar GREEN imediatamente, registrar como cobertura de regressão e não fabricar alteração de produção artificial.

- [ ] **Step 3: Add invalid-window HTTP coverage**

No mesmo arquivo, chamar:

```text
GET /api/v1/activities?dueFrom=2026-09-14T18:00:00-03:00&dueTo=2026-09-14T09:00:00-03:00
```

Esperar HTTP 400 e body com `code: "VALIDATION_ERROR"`.

- [ ] **Step 4: Verify API regression**

Run:

```bash
pnpm --filter @axes/api test -- activities.integration.spec.ts
pnpm --filter @axes/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/activities/activities.integration.spec.ts
git commit -m "test(crm): cover agenda activity window"
```

---

### Task 3: C4.1.2 — Agenda Web semanal

**Files:**
- Create: `apps/web/src/app/agenda/agenda-view.test.tsx`
- Create: `apps/web/src/app/agenda/agenda-view.tsx`
- Modify: `apps/web/src/app/crm-shell.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/page-activities-navigation.test.tsx` or create focused `page-agenda-navigation.test.tsx`

**Interfaces:**
- Consumes: `authApiRequest`, `GET /activities`, `activity.read`, activity payload already returned by API.
- Produces: `AgendaView({ accessToken, ownerUserId })`, seção `agenda` no `CrmSection`.

- [ ] **Step 1: Write failing navigation/RBAC test**

Criar `page-agenda-navigation.test.tsx` seguindo os fixtures de navegação existentes. Para sessão com `activity.read`, esperar botão `Agenda`; para sessão sem `activity.read`, afirmar ausência.

Exemplo de intenção:

```ts
expect(screen.getByRole("button", { name: "Agenda" })).toBeInTheDocument();
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @axes/web test -- page-agenda-navigation.test.tsx
```

Expected: FAIL porque `CrmSection` e `CrmShell` ainda não conhecem `agenda`.

- [ ] **Step 3: Implement shell navigation minimally**

Alterar `CrmSection` para:

```ts
export type CrmSection =
  | "companies"
  | "contacts"
  | "activities"
  | "agenda"
  | "opportunities";
```

No `CrmShell`, renderizar `Agenda` somente quando `session.permissions.includes("activity.read")`, usando `aria-current="page"` quando ativa.

- [ ] **Step 4: Write failing AgendaView behavior tests**

Em `agenda-view.test.tsx`, cobrir separadamente:

1. requisição inicial inclui `dueFrom`, `dueTo`, `sortBy=dueAt`, `sortOrder=asc`;
2. atividades são agrupadas por dia em ordem cronológica;
3. `Anterior` muda a janela sete dias para trás;
4. `Próximo` muda a janela sete dias para frente;
5. `Hoje` retorna à semana corrente;
6. filtros Tipo/Status/Prioridade entram na query;
7. estados carregando, vazio e erro são exibidos explicitamente.

Congelar o relógio com Vitest para uma segunda-feira conhecida, por exemplo:

```ts
vi.setSystemTime(new Date("2026-09-14T12:00:00-03:00"));
```

- [ ] **Step 5: Run RED for AgendaView**

Run:

```bash
pnpm --filter @axes/web test -- agenda-view.test.tsx
```

Expected: FAIL porque `AgendaView` ainda não existe.

- [ ] **Step 6: Implement `AgendaView` minimally**

Criar componente client-side que:

- calcula segunda 00:00:00.000 e domingo 23:59:59.999 da semana selecionada;
- usa `URLSearchParams` para `dueFrom`, `dueTo`, `sortBy=dueAt`, `sortOrder=asc`, `limit=100`;
- adiciona filtros somente quando diferentes de `ALL`;
- chama `authApiRequest`;
- agrupa itens por data local de `dueAt`;
- mostra horário, título, `TASK`/`APPOINTMENT`, prioridade e status;
- não oferece edição inline.

No `page.tsx`, importar `AgendaView` e renderizá-lo explicitamente quando `activeSection === "agenda"` antes do fallback de Oportunidades.

- [ ] **Step 7: Add focused CSS**

Adicionar classes `agenda-*` em `globals.css`, mantendo o design system atual, com grid responsivo simples e sem nova biblioteca visual.

- [ ] **Step 8: Run GREEN**

Run:

```bash
pnpm --filter @axes/web test -- page-agenda-navigation.test.tsx agenda-view.test.tsx
pnpm --filter @axes/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/agenda apps/web/src/app/crm-shell.tsx apps/web/src/app/page.tsx apps/web/src/app/globals.css apps/web/src/app/page-agenda-navigation.test.tsx
git commit -m "feat(crm): add weekly commercial agenda"
```

---

### Task 4: C4.1.3 — Gate, E2E and checkpoint

**Files:**
- Modify/Create E2E file under existing Playwright test location discovered in repository.
- Modify: `docs/roadmap.md`
- Modify: `docs/backlog-do-produto.md`
- Create: `docs/checkpoints/c4-1-agenda-commercial.md`

**Interfaces:**
- Consumes: fluxo autenticado existente e navegação `Agenda`.
- Produces: evidência canônica de conclusão da C4.1 e estado atualizado da Fase 2.

- [ ] **Step 1: Add E2E happy-path coverage**

No padrão dos testes Playwright existentes: autenticar, abrir `Agenda`, confirmar heading da Agenda e os controles `Anterior`, `Hoje`, `Próximo`.

- [ ] **Step 2: Add permission coverage**

Com fixture/usuário sem `activity.read`, confirmar que o botão `Agenda` não está presente. Não testar segurança apenas pela UI; manter a API protegida por `@RequirePermissions("activity.read")` como já ocorre em `/activities`.

- [ ] **Step 3: Run full local gate**

Run:

```bash
pnpm verify
pnpm test:e2e
docker compose config --quiet
docker compose build api web
```

Expected: todos GREEN.

- [ ] **Step 4: Update product documentation**

Em `docs/roadmap.md`, marcar Fase 2 como `Em andamento — C4.1 Agenda Comercial` sem declarar a fase inteira concluída.

Em `docs/backlog-do-produto.md`, adicionar item F2 para Agenda Comercial com estado concluído somente após o gate final.

Criar `docs/checkpoints/c4-1-agenda-commercial.md` contendo: base SHA, branch, PR, commits RED/GREEN, runs do CI, escopo, exclusões e próximo item da Fase 2.

- [ ] **Step 5: Run formatting and complete gate again after docs**

Run:

```bash
pnpm format:check
pnpm verify
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs apps

git commit -m "docs(crm): record C4.1 agenda commercial checkpoint"
```

- [ ] **Step 7: Pull request gate**

Abrir PR Draft para `main`. Manter Draft até o workflow completo estar GREEN. Não realizar merge sem aprovação humana explícita específica para o PR.

## Self-review

- Spec coverage: todos os critérios da spec têm tarefa correspondente.
- Persistência: nenhuma migration/tabela nova prevista.
- RBAC: somente `activity.read`.
- TDD: Task 1 e Task 3 exigem RED observado antes do código de produção; Task 2 pode ser cobertura de regressão caso o comportamento já exista, sem fabricar falha.
- YAGNI: calendário mensal, recorrência, drag-and-drop, notificações e integrações externas continuam fora do escopo.

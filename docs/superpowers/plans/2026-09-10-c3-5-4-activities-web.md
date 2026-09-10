# C3.5.4 — Web de Atividades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar ao frontend canônico `apps/web` uma área de Atividades que consuma a API tenant-aware da C3.5.2, respeite `activity.read`/`activity.write` e permita o lifecycle básico de tarefas e compromissos.

**Architecture:** A nova área será uma terceira seção do `CrmShell`, sem nova rota Next. `ActivitiesView` concentrará carregamento, filtros, formulário e mutações via `apiRequest`; o backend continuará como autoridade de autorização, isolamento multiempresa e transições. `ownerUserId` será sempre `session.user.id` nesta microentrega.

**Tech Stack:** Next.js 16.3.3, React 19.2.1, TypeScript, Vitest 4.1.11, Testing Library 16.3.3, Playwright 1.62.1, `@axes/contracts`, REST via `apiRequest`.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-5-4-activities-web-design.md`

## Global Constraints

- Não criar rota Next independente para Atividades nesta etapa.
- Não alterar Prisma schema, migrations, API backend ou RBAC.
- Não expor `Opportunity` na Web de Atividades.
- Não consultar `/admin/users`; `ownerUserId` deve ser `session.user.id`.
- O menu Atividades só aparece quando `session.permissions` contém `activity.read`.
- Controles de criação, mudança de status e inativação só aparecem quando `session.permissions` contém `activity.write`.
- Busca e status devem ser enviados para a API como filtros.
- Empresa e Contato são vínculos opcionais e usam os endpoints canônicos existentes.
- Sem agenda/calendário, recorrência, notificações, automação de follow-up, Google/Outlook ou delegação nesta microentrega.
- Após cada mutação bem-sucedida, recarregar a lista atual sem recarregar a sessão.
- Manter o padrão visual e de acessibilidade de `apps/web`.

---

## File Structure

- `apps/web/src/app/crm-shell.tsx`: ampliar `CrmSection` e navegação condicional por permissão.
- `apps/web/src/app/page.tsx`: renderizar `ActivitiesView` e fornecer token, usuário e permissão de escrita.
- `apps/web/src/app/page-activities-navigation.test.tsx`: contrato de navegação e visibilidade por `activity.read`.
- `apps/web/src/app/activities/activities-view.tsx`: lista, filtros, criação, lifecycle e vínculos opcionais.
- `apps/web/src/app/activities/activities-view.test.tsx`: testes funcionais da nova view.
- `apps/web/src/app/globals.css`: estilos novos estritamente necessários.
- `tests/e2e/crm-core.spec.ts`: fluxo E2E de Atividades no CRM Core.
- `CHANGELOG.md`: registro da C3.5.4.
- `docs/checkpoints/c3-5-4-activities-web.md`: evidência RED/GREEN e gate de integração.

---

### Task 1: Navegação canônica e permissão de leitura

**Files:**
- Create: `apps/web/src/app/page-activities-navigation.test.tsx`
- Create: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/crm-shell.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `AuthSessionResponse.permissions`, `AuthSessionResponse.user.id`, `CrmShell` atual.
- Produces: `CrmSection = "companies" | "contacts" | "activities"`; `ActivitiesViewProps = { accessToken: string; ownerUserId: string; canWrite: boolean }`.

- [ ] **Step 1: Escrever o RED de navegação**

Criar sessão de teste contendo `activity.read` e `activity.write`, autenticar `Home`, clicar em `Atividades` e esperar o heading da nova área:

```tsx
fireEvent.click(await screen.findByRole("button", { name: "Atividades" }));
expect(
  await screen.findByRole("heading", { name: "Atividades e compromissos" })
).toBeInTheDocument();
```

No mesmo arquivo, criar sessão sem `activity.read` e verificar:

```tsx
expect(screen.queryByRole("button", { name: "Atividades" })).not.toBeInTheDocument();
```

O mock de `GET /activities` deve devolver:

```ts
{ items: [], page: 1, limit: 20, total: 0 }
```

- [ ] **Step 2: Executar o RED**

```bash
pnpm --filter @axes/web test -- src/app/page-activities-navigation.test.tsx
```

Expected: FAIL porque `CrmSection` e o menu ainda não suportam `activities`.

- [ ] **Step 3: Implementar a navegação mínima**

Em `crm-shell.tsx`:

```ts
export type CrmSection = "companies" | "contacts" | "activities";
```

Adicionar `permissions: string[]` nas props e renderizar o botão apenas quando:

```ts
permissions.includes("activity.read")
```

Em `page.tsx`, importar a view e renderizar:

```tsx
<ActivitiesView
  accessToken={session.accessToken}
  ownerUserId={session.user.id}
  canWrite={session.permissions.includes("activity.write")}
/>
```

Criar `activities-view.tsx` com heading e carregamento inicial de `PENDING` via `apiRequest`.

- [ ] **Step 4: Verificar GREEN e regressão de navegação**

```bash
pnpm --filter @axes/web test -- src/app/page-activities-navigation.test.tsx src/app/page-contacts-navigation.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/crm-shell.tsx apps/web/src/app/page.tsx apps/web/src/app/page-activities-navigation.test.tsx apps/web/src/app/activities/activities-view.tsx
git commit -m "feat: add activities workspace navigation"
```

---

### Task 2: Listagem, status, busca e estados

**Files:**
- Create: `apps/web/src/app/activities/activities-view.test.tsx`
- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `GET /activities` com `page`, `limit`, `status`, `sortBy`, `sortOrder` e `q`.
- Produces: `ActivityRecord`, `ActivityListResponse` e função interna `loadActivities`.

Definir os tipos locais de resposta:

```ts
type ActivityRecord = {
  id: string;
  type: "TASK" | "APPOINTMENT";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  description: string | null;
  companyId: string | null;
  contactId: string | null;
  ownerUserId: string;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

type ActivityListResponse = {
  items: ActivityRecord[];
  page: number;
  limit: number;
  total: number;
};
```

- [ ] **Step 1: Escrever RED de lista e filtros**

Testar:
- request inicial com `status=PENDING`;
- clique em `Concluídas` gera `status=COMPLETED`;
- submit da busca `proposta` gera `q=proposta`;
- estados `Carregando`, erro e vazio;
- `PENDING` com prazo anterior a `Date.now()` exibe `Vencida`.

- [ ] **Step 2: Executar RED**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

Expected: FAIL porque filtros e apresentação ainda não existem.

- [ ] **Step 3: Implementar listagem e filtros**

Montar a URL exatamente por `URLSearchParams`:

```ts
const params = new URLSearchParams({
  page: "1",
  limit: "20",
  status,
  sortBy: "dueAt",
  sortOrder: "asc",
});
if (query.trim()) params.set("q", query.trim());

const result = await apiRequest<ActivityListResponse>(
  `/activities?${params.toString()}`,
  { accessToken }
);
```

Usar submit explícito para busca. Exibir tipo, título, prioridade, prazo e status; marcar vencida somente se `status === "PENDING"` e `dueAt` estiver no passado.

- [ ] **Step 4: Verificar GREEN e typecheck**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
pnpm --filter @axes/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/activities/activities-view.tsx apps/web/src/app/activities/activities-view.test.tsx apps/web/src/app/globals.css
git commit -m "feat: list and filter activities"
```

---

### Task 3: Criação self-owned e vínculos Empresa/Contato

**Files:**
- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/activities/activities-view.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `ActivityCreateInput`, `POST /activities`, `GET /companies?page=1&limit=100`, `GET /contacts?page=1&limit=100`.
- Produces: formulário `Nova atividade` sem campo Opportunity.

- [ ] **Step 1: Escrever RED de criação**

Com `canWrite={true}`, abrir o formulário, preencher `TASK`, título `Preparar proposta`, prioridade `HIGH`, Empresa e Contato. Interceptar o POST e verificar:

```ts
expect(JSON.parse(String(init?.body))).toMatchObject({
  type: "TASK",
  priority: "HIGH",
  title: "Preparar proposta",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  companyId,
  contactId,
});
```

Verificar também:

```tsx
expect(screen.queryByLabelText(/oportunidade/i)).not.toBeInTheDocument();
```

Com `canWrite={false}`:

```tsx
expect(screen.queryByRole("button", { name: "Nova atividade" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Executar RED**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

Expected: FAIL porque o formulário ainda não existe.

- [ ] **Step 3: Implementar criação mínima**

Usar `ActivityCreateInput` de `@axes/contracts`:

```ts
const payload: ActivityCreateInput = {
  type: form.type,
  priority: form.priority,
  title: form.title.trim(),
  ownerUserId,
  ...(form.description.trim() ? { description: form.description.trim() } : {}),
  ...(form.companyId ? { companyId: form.companyId } : {}),
  ...(form.contactId ? { contactId: form.contactId } : {}),
  ...(form.dueAt ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
};
```

Carregar Empresas e Contatos ao abrir o formulário; enviar `POST /activities`; bloquear submit enquanto `submitting`; limpar o formulário e chamar `loadActivities` após sucesso.

- [ ] **Step 4: Verificar GREEN e typecheck**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
pnpm --filter @axes/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/activities/activities-view.tsx apps/web/src/app/activities/activities-view.test.tsx apps/web/src/app/globals.css
git commit -m "feat: create linked activities in web"
```

---

### Task 4: Lifecycle — concluir, cancelar, reabrir e inativar

**Files:**
- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/activities/activities-view.test.tsx`

**Interfaces:**
- Consumes: `ActivityUpdateInput`, `PATCH /activities/:id`, `DELETE /activities/:id`.
- Produces: ações `changeStatus` e `inactivateActivity`.

- [ ] **Step 1: Escrever RED das mutações**

Verificar os corpos e métodos:

```text
PATCH /activities/activity-id {"status":"COMPLETED"}
PATCH /activities/activity-id {"status":"CANCELLED"}
PATCH /activities/activity-id {"status":"PENDING"}
DELETE /activities/activity-id
```

Validar que sessão sem escrita não vê esses controles.

- [ ] **Step 2: Executar RED**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

Expected: FAIL porque o lifecycle ainda não está conectado.

- [ ] **Step 3: Implementar mutações**

```ts
async function changeStatus(id: string, status: ActivityStatus) {
  const payload: ActivityUpdateInput = { status };
  await apiRequest<ActivityRecord>(`/activities/${id}`, {
    accessToken,
    method: "PATCH",
    body: payload,
  });
  await loadActivities(activeStatus, query);
}

async function inactivateActivity(id: string) {
  await apiRequest<void>(`/activities/${id}`, {
    accessToken,
    method: "DELETE",
  });
  await loadActivities(activeStatus, query);
}
```

Exibir:
- `PENDING`: `Concluir`, `Cancelar`, `Inativar`;
- `COMPLETED`: `Reabrir`, `Inativar`;
- `CANCELLED`: `Reabrir`, `Inativar`;
- reader-only: nenhum controle de mutação.

- [ ] **Step 4: Verificar a suíte Web**

```bash
pnpm --filter @axes/web test
pnpm --filter @axes/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/activities/activities-view.tsx apps/web/src/app/activities/activities-view.test.tsx
git commit -m "feat: manage activity lifecycle in web"
```

---

### Task 5: E2E do CRM Core

**Files:**
- Modify: `tests/e2e/crm-core.spec.ts`

**Interfaces:**
- Consumes: `playwright.config.ts`, que inicia API e Web automaticamente; banco PostgreSQL deve estar acessível em `DATABASE_URL`.
- Produces: cenário browser que prova navegação, criação e conclusão de Activity.

- [ ] **Step 1: Acrescentar cenário E2E**

No fluxo autenticado, executar:

```ts
await page.getByRole("button", { name: "Atividades" }).click();
await expect(
  page.getByRole("heading", { name: "Atividades e compromissos" })
).toBeVisible();
await page.getByRole("button", { name: "Nova atividade" }).click();
await page.getByLabel("Título").fill("Follow-up E2E");
await page.getByRole("button", { name: "Criar atividade" }).click();
await expect(page.getByText("Follow-up E2E")).toBeVisible();
await page.getByRole("button", { name: "Concluir" }).first().click();
await page.getByRole("button", { name: "Concluídas" }).click();
await expect(page.getByText("Follow-up E2E")).toBeVisible();
```

- [ ] **Step 2: Executar o E2E específico**

```bash
pnpm test:e2e -- tests/e2e/crm-core.spec.ts
```

Expected: PASS. O `playwright.config.ts` sobe API em `127.0.0.1:3001` e Web em `127.0.0.1:3000`; usar `DATABASE_URL` do ambiente de teste.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/crm-core.spec.ts
git commit -m "test: cover activities web lifecycle e2e"
```

---

### Task 6: Documentação e gate final

**Files:**
- Modify: `CHANGELOG.md`
- Create: `docs/checkpoints/c3-5-4-activities-web.md`

**Interfaces:**
- Consumes: SHAs e resultados reais das Tasks 1–5.
- Produces: checkpoint auditável e PR pronto para revisão.

- [ ] **Step 1: Atualizar changelog**

Registrar: terceira seção `Atividades`, filtros via API, criação self-owned, Empresa/Contato opcionais, lifecycle, permissões e itens explicitamente fora do escopo.

- [ ] **Step 2: Criar checkpoint**

Registrar no checkpoint:
- base `29dc19eb00de99fa20544d520558b4835f4e17ef`;
- SHA do primeiro RED funcional e sua falha observada;
- SHA GREEN final;
- arquivos alterados;
- resultado da suíte Web e typecheck;
- resultado E2E;
- resultado do gate integral do PR;
- confirmação de ausência de mudança em schema, migration, backend e RBAC;
- merge condicionado à aprovação explícita.

- [ ] **Step 3: Executar verificação local completa disponível**

```bash
pnpm verify
```

Expected: PASS para foundation, format, lint, typecheck, testes e build. O E2E é verificado separadamente pelo comando da Task 5 e novamente pelo workflow do PR.

- [ ] **Step 4: Commit documental**

```bash
git add CHANGELOG.md docs/checkpoints/c3-5-4-activities-web.md
git commit -m "docs: record C3.5.4 activities web delivery"
```

- [ ] **Step 5: Abrir PR em draft**

Título: `C3.5.4 — Activities web workspace`

Base: `main`

Head: `feat/c3-5-4-activities-web`

O corpo deve registrar escopo, evidência RED/GREEN, E2E, ausência de backend/schema/RBAC e gate humano de merge.

- [ ] **Step 6: Validar CI no SHA final**

O workflow deve terminar GREEN no mesmo SHA final para dependências, Prisma/migrations, source/tests, E2E, Compose e build das imagens. Se houver commit depois desse resultado, repetir a validação no novo SHA.

- [ ] **Step 7: Marcar ready-for-review e parar antes do merge**

Somente após o CI integral GREEN. Nenhum merge é realizado nesta Task.

---

## Plan Self-Review

O plano cobre navegação, permissões, listagem, filtros, busca, loading/erro/vazio, atividade vencida, criação self-owned, Empresa/Contato, lifecycle, ausência de Opportunity, E2E, documentação e gate final. Os nomes de tipos e contratos usados nas Tasks 3 e 4 correspondem a `@axes/contracts`, e nenhuma Task exige alteração de backend, banco ou RBAC.

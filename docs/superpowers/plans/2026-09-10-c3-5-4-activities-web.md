# C3.5.4 — Web de Atividades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar ao frontend canônico `apps/web` uma área de Atividades que consuma a API tenant-aware da C3.5.2, respeite `activity.read`/`activity.write` e permita o lifecycle básico de tarefas e compromissos.

**Architecture:** A nova área será uma terceira seção do `CrmShell`, sem nova rota Next. `ActivitiesView` concentrará carregamento, filtros, formulário e mutações via `apiRequest`; o backend continuará sendo a autoridade de autorização, isolamento multiempresa e transições. `ownerUserId` será sempre `session.user.id` nesta microentrega.

**Tech Stack:** Next.js 16.3.3, React 19.2.1, TypeScript, Vitest 4.1.11, Testing Library 16.3.3, `@axes/contracts`, REST via `apiRequest`.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-5-4-activities-web-design.md`

## Global Constraints

- Não criar rota Next independente para Atividades nesta etapa.
- Não alterar Prisma schema, migrations, API backend ou RBAC.
- Não expor `Opportunity` na Web de Atividades.
- Não consultar `/admin/users`; `ownerUserId` deve ser `session.user.id`.
- O menu Atividades só aparece quando `session.permissions` contém `activity.read`.
- Controles de criação, mudança de status e inativação só aparecem quando `session.permissions` contém `activity.write`.
- Busca e status devem ser enviados para a API como filtros; não criar fonte de verdade paralela apenas no navegador.
- Empresa e Contato são vínculos opcionais e usam os endpoints canônicos existentes.
- Sem agenda/calendário, recorrência, notificações, automação de follow-up, Google/Outlook ou delegação nesta microentrega.
- Após cada mutação bem-sucedida, recarregar a lista atual sem recarregar a sessão.
- Manter o padrão visual e de acessibilidade de `apps/web`.

---

## File Structure

- `apps/web/src/app/crm-shell.tsx`: ampliar `CrmSection` e navegação condicional por permissão.
- `apps/web/src/app/page.tsx`: renderizar `ActivitiesView` e fornecer `accessToken`, `user.id` e permissões.
- `apps/web/src/app/page-activities-navigation.test.tsx`: contrato de navegação e visibilidade por `activity.read`.
- `apps/web/src/app/activities/activities-view.tsx`: lista, filtros, criação, lifecycle e vínculos opcionais.
- `apps/web/src/app/activities/activities-view.test.tsx`: testes funcionais unitários da nova view.
- `apps/web/src/app/globals.css`: apenas estilos novos necessários para estados, formulário, tabela/cartões e responsividade.
- `tests/e2e/crm-core.spec.ts`: acrescentar fluxo E2E de Atividades sem remover o cenário CRM Core existente.
- `CHANGELOG.md`: registrar C3.5.4.
- `docs/checkpoints/c3-5-4-activities-web.md`: evidência RED/GREEN, escopo e gate de integração.

---

### Task 1: Navegação canônica e permissão de leitura

**Files:**
- Create: `apps/web/src/app/page-activities-navigation.test.tsx`
- Create: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/crm-shell.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `AuthSessionResponse.permissions: string[]`, `AuthSessionResponse.user.id`, `CrmShell` atual.
- Produces: `CrmSection = "companies" | "contacts" | "activities"`; `ActivitiesViewProps = { accessToken: string; ownerUserId: string; canWrite: boolean }`.

- [ ] **Step 1: Escrever RED de navegação com `activity.read`**

Criar `page-activities-navigation.test.tsx` com sessão contendo `activity.read` e `activity.write`, mock de `/auth/login` e resposta vazia para `/activities?...`. O teste deve autenticar, localizar o botão `Atividades`, clicar e esperar o heading `Atividades e compromissos`.

```tsx
it("opens activities when the session has activity.read", async () => {
  // login -> sessionWithActivities
  // activities request -> { items: [], page: 1, limit: 20, total: 0 }
  render(<Home />);
  // preencher login e entrar
  fireEvent.click(await screen.findByRole("button", { name: "Atividades" }));
  expect(
    await screen.findByRole("heading", { name: "Atividades e compromissos" })
  ).toBeInTheDocument();
});
```

Adicionar segundo teste com sessão sem `activity.read`:

```tsx
expect(screen.queryByRole("button", { name: "Atividades" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Executar RED e confirmar causa funcional**

Run:

```bash
pnpm --filter @axes/web test -- src/app/page-activities-navigation.test.tsx
```

Expected: FAIL porque `CrmSection`/menu ainda não incluem `activities` e `ActivitiesView` ainda não está integrada.

- [ ] **Step 3: Implementar navegação mínima e stub funcional da view**

Em `crm-shell.tsx`:

```ts
export type CrmSection = "companies" | "contacts" | "activities";
```

Adicionar `permissions: string[]` a `CrmShellProps` e renderizar o botão somente quando `permissions.includes("activity.read")`.

Em `page.tsx`, importar `ActivitiesView` e renderizar:

```tsx
<ActivitiesView
  accessToken={session.accessToken}
  ownerUserId={session.user.id}
  canWrite={session.permissions.includes("activity.write")}
/>
```

Criar inicialmente `activities-view.tsx` com heading e carregamento da lista pendente via `apiRequest`, sem formulário/lifecycle ainda.

- [ ] **Step 4: Executar o teste de navegação e regressões Web**

Run:

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

### Task 2: Listagem, status, busca e estados visuais

**Files:**
- Create: `apps/web/src/app/activities/activities-view.test.tsx`
- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `GET /activities?page=1&limit=20&status=<STATUS>&sortBy=dueAt&sortOrder=asc&q=<QUERY>`.
- Produces: tipo local `ActivityRecord`, função interna `loadActivities(status, query)`, tabs `PENDING|COMPLETED|CANCELLED`.

Definir em `activities-view.tsx`:

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

- [ ] **Step 1: Escrever RED de lista/filtros**

Cobrir:
- `PENDING` como filtro inicial;
- clique em `Concluídas` gera request com `status=COMPLETED`;
- busca por `q=proposta` é enviada à API;
- loading, erro e estado vazio;
- atividade pendente com `dueAt < now` recebe texto/indicador `Vencida`.

- [ ] **Step 2: Executar RED**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

Expected: FAIL porque tabs, busca e estados ainda não existem.

- [ ] **Step 3: Implementar `loadActivities` e apresentação mínima**

Montar `URLSearchParams`:

```ts
const params = new URLSearchParams({
  page: "1",
  limit: "20",
  status,
  sortBy: "dueAt",
  sortOrder: "asc",
});
if (query.trim()) params.set("q", query.trim());
await apiRequest<ActivityListResponse>(`/activities?${params.toString()}`, { accessToken });
```

Usar botão explícito `Buscar` ou submit de formulário para evitar request por tecla nesta etapa. Renderizar cards/tabela responsiva com tipo, título, prioridade, prazo e status.

- [ ] **Step 4: Executar testes e typecheck**

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

### Task 3: Criação atribuída ao usuário autenticado e vínculos comerciais

**Files:**
- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/activities/activities-view.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `ActivityCreateInput`, `POST /activities`, `GET /companies?page=1&limit=100`, `GET /contacts?page=1&limit=100`.
- Produces: formulário de criação sem `Opportunity`; payload com `ownerUserId` vindo da prop.

- [ ] **Step 1: Escrever RED de criação**

Testar sessão writer com `ownerUserId = "11111111-1111-4111-8111-111111111111"`. Abrir `Nova atividade`, preencher tipo, título, prioridade, prazo, Empresa e Contato. Interceptar `POST /activities` e verificar corpo:

```ts
expect(JSON.parse(String(init?.body))).toMatchObject({
  type: "TASK",
  priority: "HIGH",
  title: "Preparar proposta",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  companyId: companyId,
  contactId: contactId,
});
```

Confirmar também:

```tsx
expect(screen.queryByLabelText(/oportunidade/i)).not.toBeInTheDocument();
```

E, com `canWrite={false}`:

```tsx
expect(screen.queryByRole("button", { name: "Nova atividade" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Executar RED**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

Expected: FAIL porque o formulário e os vínculos ainda não existem.

- [ ] **Step 3: Implementar formulário e opções auxiliares**

Usar `ActivityCreateInput` de `@axes/contracts`. Carregar Empresas/Contatos quando o formulário for aberto e `canWrite` for true. Converter `datetime-local` apenas quando preenchido:

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

Enviar `POST /activities`, bloquear submit com `submitting`, fechar/limpar formulário e chamar `loadActivities` após sucesso.

- [ ] **Step 4: Executar testes e typecheck**

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
- Produces: `changeStatus(id, status)` e `inactivateActivity(id)` que recarregam a lista atual após sucesso.

- [ ] **Step 1: Escrever RED para todas as transições**

Verificar requests:

```ts
PATCH /activities/activity-id body { "status": "COMPLETED" }
PATCH /activities/activity-id body { "status": "CANCELLED" }
PATCH /activities/activity-id body { "status": "PENDING" }
DELETE /activities/activity-id
```

Confirmar que controles não aparecem com `canWrite={false}`.

- [ ] **Step 2: Executar RED**

```bash
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

Expected: FAIL porque ações de lifecycle ainda não existem.

- [ ] **Step 3: Implementar ações mínimas**

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

Regras de botões:
- `PENDING`: mostrar `Concluir` e `Cancelar`;
- `COMPLETED`/`CANCELLED`: mostrar `Reabrir`;
- writer: mostrar `Inativar` em todos os status;
- reader-only: nenhum botão de mutação.

- [ ] **Step 4: Executar testes Web completos**

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

### Task 5: E2E e regressão do CRM Core

**Files:**
- Modify: `tests/e2e/crm-core.spec.ts`

**Interfaces:**
- Consumes: stack real Compose, login real, endpoints reais de Activity.
- Produces: cenário E2E que prova navegação e criação/lifecycle de Activity no navegador.

- [ ] **Step 1: Acrescentar cenário E2E de Atividades**

No fluxo autenticado do CRM Core, após login:

```ts
await page.getByRole("button", { name: "Atividades" }).click();
await expect(page.getByRole("heading", { name: "Atividades e compromissos" })).toBeVisible();
await page.getByRole("button", { name: "Nova atividade" }).click();
await page.getByLabel("Título").fill("Follow-up E2E");
await page.getByRole("button", { name: "Criar atividade" }).click();
await expect(page.getByText("Follow-up E2E")).toBeVisible();
await page.getByRole("button", { name: "Concluir" }).first().click();
await page.getByRole("button", { name: "Concluídas" }).click();
await expect(page.getByText("Follow-up E2E")).toBeVisible();
```

Não adicionar Opportunity nem dependência externa.

- [ ] **Step 2: Executar E2E do CRM Core**

Run conforme script já usado pelo projeto/CI para Playwright. Se o ambiente local não estiver levantado, usar o workflow do PR como evidência obrigatória em vez de alegar execução local.

Expected: cenário CRM Core existente e Atividades passam juntos.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/crm-core.spec.ts
git commit -m "test: cover activities web lifecycle e2e"
```

---

### Task 6: Documentação, PR e gate final

**Files:**
- Modify: `CHANGELOG.md`
- Create: `docs/checkpoints/c3-5-4-activities-web.md`

**Interfaces:**
- Consumes: SHAs de RED/GREEN e resultados reais do CI.
- Produces: registro auditável da microentrega e PR pronto para revisão.

- [ ] **Step 1: Atualizar changelog**

Registrar em `Cycle 3.5.4`:
- terceira seção `Atividades` no shell;
- filtros por status/busca via API;
- criação atribuída ao usuário autenticado;
- Empresa/Contato opcionais;
- lifecycle concluir/cancelar/reabrir/inativar;
- leitura/escrita conforme permissões;
- Opportunity/agenda/follow-up fora de escopo.

- [ ] **Step 2: Criar checkpoint**

`docs/checkpoints/c3-5-4-activities-web.md` deve registrar:
- base da branch;
- SHA do RED funcional e motivo da falha;
- SHA GREEN;
- arquivos alterados;
- testes Web/E2E/Compose/build;
- confirmação de que não houve schema/migration/backend/RBAC;
- declaração explícita: merge não autorizado pelo checkpoint.

- [ ] **Step 3: Rodar gate local possível**

```bash
pnpm --filter @axes/web test
pnpm --filter @axes/web typecheck
```

Se houver scripts globais disponíveis no repo, executar também o gate global correspondente antes do PR.

- [ ] **Step 4: Commit documental**

```bash
git add CHANGELOG.md docs/checkpoints/c3-5-4-activities-web.md
git commit -m "docs: record C3.5.4 activities web delivery"
```

- [ ] **Step 5: Abrir PR em draft e aguardar CI integral**

Título:

```text
C3.5.4 — Activities web workspace
```

Base: `main`

Head: `feat/c3-5-4-activities-web`

O corpo deve resumir escopo, RED/GREEN, ausência de backend/schema/RBAC e declarar que merge exige aprovação explícita.

- [ ] **Step 6: Verificar head exato e CI**

Confirmar que o workflow do PR foi executado no SHA final e terminou GREEN em:
- install/dependencies;
- Prisma/migrations;
- source/tests;
- E2E;
- Compose;
- build das imagens.

Se o head mudar depois da documentação, repetir o gate no novo head antes de marcar o PR ready-for-review.

- [ ] **Step 7: Marcar ready-for-review e parar no gate humano**

Somente após CI integral GREEN no head final. Não fazer merge. A mensagem final deve pedir aprovação explícita do PR da C3.5.4.

---

## Plan Self-Review

- Cobertura da spec: navegação, permissões, leitura, filtros, busca, estados, criação, self-owner, Empresa/Contato, lifecycle, ausência de Opportunity, responsividade, E2E e gate final possuem tarefas explícitas.
- Placeholders: nenhum `TBD`, `TODO`, “implementar depois” ou instrução genérica sem ação concreta.
- Tipos: `ActivityRecord`, `ActivityListResponse`, `ActivityCreateInput`, `ActivityUpdateInput` e `ActivityStatus` usam os nomes já existentes nos contratos/API.
- Escopo: nenhuma tarefa requer alteração de backend, banco, migration ou RBAC.

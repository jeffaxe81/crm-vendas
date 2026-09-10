# C3.5.4 — Web de Atividades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar ao frontend canônico `apps/web` uma área de Atividades que consuma a API tenant-aware da C3.5.2, respeite `activity.read`/`activity.write` e permita o lifecycle básico de tarefas e compromissos.

**Architecture:** Atividades será uma terceira seção do `CrmShell`, sem nova rota Next. `ActivitiesView` concentrará leitura, filtros, formulário e mutações via `apiRequest`; o backend continuará sendo a autoridade de autorização, isolamento multiempresa e transições. Nesta entrega, `ownerUserId` será sempre `session.user.id`.

**Tech Stack:** Next.js 16.3.3, React 19.2.1, TypeScript, Vitest 4.1.11, Testing Library 16.3.3, Playwright 1.62.1, `@axes/contracts` e REST via `apiRequest`.

**Spec:** `docs/superpowers/specs/2026-09-10-c3-5-4-activities-web-design.md`

## Global Constraints

- Não criar rota Next independente para Atividades nesta etapa.
- Não alterar Prisma schema, migrations, API backend ou RBAC.
- Não expor `Opportunity`.
- Não consultar `/admin/users`; `ownerUserId` deve ser `session.user.id`.
- O menu Atividades só aparece com `activity.read`.
- Controles de mutação só aparecem com `activity.write`.
- Busca e status são filtros da API, não uma segunda fonte de verdade no navegador.
- Empresa e Contato são vínculos opcionais pelos endpoints canônicos existentes.
- Sem agenda/calendário, recorrência, notificações, follow-up automático, Google/Outlook ou delegação.
- Depois de mutações bem-sucedidas, recarregar a lista atual sem recarregar a sessão.
- Manter o padrão visual e de acessibilidade de `apps/web`.

## File Structure

- `apps/web/src/app/crm-shell.tsx`: ampliar `CrmSection` e menu condicional.
- `apps/web/src/app/page.tsx`: renderizar `ActivitiesView` com sessão e permissões.
- `apps/web/src/app/page-activities-navigation.test.tsx`: contrato de navegação e `activity.read`.
- `apps/web/src/app/activities/activities-view.tsx`: lista, filtros, criação, lifecycle e vínculos.
- `apps/web/src/app/activities/activities-view.test.tsx`: testes funcionais da view.
- `apps/web/src/app/globals.css`: estilos estritamente necessários.
- `tests/e2e/crm-core.spec.ts`: fluxo real de Atividades no CRM Core.
- `CHANGELOG.md`: registro da entrega.
- `docs/checkpoints/c3-5-4-activities-web.md`: evidências RED/GREEN e gate.

---

### Task 1: Navegação canônica e permissão de leitura

**Files:**

- Create: `apps/web/src/app/page-activities-navigation.test.tsx`
- Create: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/crm-shell.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**

- Consumes: `AuthSessionResponse.permissions`, `AuthSessionResponse.user.id`, `CrmShell`.
- Produces: `CrmSection = "companies" | "contacts" | "activities"` e `ActivitiesViewProps = { accessToken: string; ownerUserId: string; canWrite: boolean }`.

- [ ] **Step 1: Escrever o RED de navegação.**

O teste autentica uma sessão com `activity.read`, procura o botão `Atividades`, entra na seção e espera o heading `Atividades e compromissos`. Um segundo teste usa sessão sem `activity.read` e confirma que o botão não existe.

- [ ] **Step 2: Executar o RED.**

```text
pnpm --filter @axes/web test -- src/app/page-activities-navigation.test.tsx
```

Resultado esperado: FAIL funcional porque o shell ainda não oferece a seção `activities`.

- [ ] **Step 3: Implementar o mínimo para GREEN.**

`crm-shell.tsx` deve aceitar `permissions` e incluir `activities` em `CrmSection`. O botão Atividades será renderizado somente com `activity.read`. `page.tsx` deverá renderizar a nova view assim:

```text
<ActivitiesView
  accessToken={session.accessToken}
  ownerUserId={session.user.id}
  canWrite={session.permissions.includes("activity.write")}
/>
```

A primeira versão de `ActivitiesView` terá o heading e carregará a lista `PENDING` via `apiRequest`, sem formulário ou lifecycle.

- [ ] **Step 4: Verificar GREEN e regressão de navegação.**

```text
pnpm --filter @axes/web test -- src/app/page-activities-navigation.test.tsx src/app/page-contacts-navigation.test.tsx
pnpm --filter @axes/web typecheck
```

- [ ] **Step 5: Commit.**

```text
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
- Produces: lista tipada, tabs `PENDING|COMPLETED|CANCELLED`, busca e indicador de vencimento.

- [ ] **Step 1: Escrever RED de lista e filtros.**

Cobrir `PENDING` inicial, troca para `COMPLETED`, envio de `q=proposta`, loading, erro, vazio e atividade pendente vencida.

- [ ] **Step 2: Executar RED.**

```text
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

- [ ] **Step 3: Implementar filtros pela API.**

Montar `URLSearchParams` com `page=1`, `limit=20`, `status`, `sortBy=dueAt` e `sortOrder=asc`; acrescentar `q` somente quando a busca estiver preenchida. Usar submit explícito da busca para não disparar request a cada tecla.

- [ ] **Step 4: Verificar GREEN e typecheck.**

```text
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
pnpm --filter @axes/web typecheck
```

- [ ] **Step 5: Commit.**

```text
git add apps/web/src/app/activities/activities-view.tsx apps/web/src/app/activities/activities-view.test.tsx apps/web/src/app/globals.css
git commit -m "feat: list and filter activities"
```

---

### Task 3: Criação self-owned e vínculos comerciais

**Files:**

- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/activities/activities-view.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Consumes: `ActivityCreateInput`, `POST /activities`, `GET /companies?page=1&limit=100` e `GET /contacts?page=1&limit=100`.
- Produces: formulário sem Opportunity, com `ownerUserId` vindo da sessão.

- [ ] **Step 1: Escrever RED de criação.**

Testar tipo, título, prioridade, prazo e vínculos. O corpo do POST deve conter o `ownerUserId` recebido por prop e IDs opcionais de Empresa/Contato. Confirmar que não existe campo Opportunity e que `Nova atividade` não aparece com `canWrite=false`.

Payload esperado:

```text
{
  "type": "TASK",
  "priority": "HIGH",
  "title": "Preparar proposta",
  "ownerUserId": "11111111-1111-4111-8111-111111111111",
  "companyId": "<company-id>",
  "contactId": "<contact-id>"
}
```

- [ ] **Step 2: Executar RED.**

```text
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

- [ ] **Step 3: Implementar formulário mínimo.**

Usar `ActivityCreateInput`. Carregar opções de Empresa/Contato ao abrir o formulário. Converter `datetime-local` para ISO somente quando preenchido. Bloquear submissão duplicada, fechar e limpar o formulário após sucesso e recarregar a lista atual.

- [ ] **Step 4: Verificar GREEN.**

```text
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
pnpm --filter @axes/web typecheck
```

- [ ] **Step 5: Commit.**

```text
git add apps/web/src/app/activities/activities-view.tsx apps/web/src/app/activities/activities-view.test.tsx apps/web/src/app/globals.css
git commit -m "feat: create linked activities in web"
```

---

### Task 4: Lifecycle de atividades

**Files:**

- Modify: `apps/web/src/app/activities/activities-view.tsx`
- Modify: `apps/web/src/app/activities/activities-view.test.tsx`

**Interfaces:**

- Consumes: `ActivityUpdateInput`, `PATCH /activities/:id`, `DELETE /activities/:id`.
- Produces: concluir, cancelar, reabrir e inativar.

- [ ] **Step 1: Escrever RED das transições.**

Verificar os contratos:

```text
PATCH /activities/<id> { "status": "COMPLETED" }
PATCH /activities/<id> { "status": "CANCELLED" }
PATCH /activities/<id> { "status": "PENDING" }
DELETE /activities/<id>
```

Também confirmar ausência de controles de mutação em modo somente leitura.

- [ ] **Step 2: Executar RED.**

```text
pnpm --filter @axes/web test -- src/app/activities/activities-view.test.tsx
```

- [ ] **Step 3: Implementar ações mínimas.**

Regras de UI: `PENDING` mostra Concluir/Cancelar; `COMPLETED` e `CANCELLED` mostram Reabrir; writer pode Inativar em qualquer status; reader não vê ações. Toda mutação bem-sucedida recarrega a lista atual.

- [ ] **Step 4: Verificar GREEN completo da Web.**

```text
pnpm --filter @axes/web test
pnpm --filter @axes/web typecheck
```

- [ ] **Step 5: Commit.**

```text
git add apps/web/src/app/activities/activities-view.tsx apps/web/src/app/activities/activities-view.test.tsx
git commit -m "feat: manage activity lifecycle in web"
```

---

### Task 5: E2E e regressão do CRM Core

**Files:**

- Modify: `tests/e2e/crm-core.spec.ts`

**Interfaces:**

- Consumes: stack real levantada pelo Playwright, login real e API real de Activity.
- Produces: fluxo E2E de navegação, criação e conclusão.

- [ ] **Step 1: Acrescentar cenário E2E.**

Depois do login: entrar em Atividades, criar `Follow-up E2E`, confirmar que aparece, concluir, abrir `Concluídas` e confirmar novamente a atividade.

- [ ] **Step 2: Executar E2E.**

```text
pnpm test:e2e -- tests/e2e/crm-core.spec.ts
```

O Playwright usa `playwright.config.ts` para levantar API e Web. O banco PostgreSQL precisa estar disponível; no PR, o workflow fornece esse serviço.

- [ ] **Step 3: Commit.**

```text
git add tests/e2e/crm-core.spec.ts
git commit -m "test: cover activities web lifecycle e2e"
```

---

### Task 6: Documentação e gate final

**Files:**

- Modify: `CHANGELOG.md`
- Create: `docs/checkpoints/c3-5-4-activities-web.md`

**Interfaces:**

- Consumes: SHAs RED/GREEN e resultados reais do CI.
- Produces: checkpoint auditável e PR pronto para revisão.

- [ ] **Step 1: Atualizar changelog.**

Registrar seção Atividades, filtros via API, criação self-owned, vínculos Empresa/Contato, lifecycle, permissões e exclusões de Opportunity/agenda/follow-up.

- [ ] **Step 2: Criar checkpoint.**

Registrar base da branch, SHA RED e motivo funcional, SHA GREEN, arquivos alterados, testes executados, CI e confirmação de que não houve mudança de schema/migration/backend/RBAC. Declarar que o checkpoint não autoriza merge.

- [ ] **Step 3: Executar gate local aplicável.**

```text
pnpm --filter @axes/web test
pnpm --filter @axes/web typecheck
pnpm verify
```

- [ ] **Step 4: Commit documental.**

```text
git add CHANGELOG.md docs/checkpoints/c3-5-4-activities-web.md
git commit -m "docs: record C3.5.4 activities web delivery"
```

- [ ] **Step 5: Verificar o PR #14 no SHA final.**

O workflow deve terminar GREEN no head final em instalação, Prisma/migrations, source/tests, E2E, Compose e build das imagens.

- [ ] **Step 6: Marcar ready-for-review e parar no gate humano.**

Não fazer merge. Solicitar aprovação explícita do PR #14.

---

## Plan Self-Review

- A spec está coberta por tarefas explícitas de navegação, permissões, leitura, filtros, busca, estados, criação, self-owner, Empresa/Contato, lifecycle, ausência de Opportunity, E2E e gate final.
- Não há tarefa que exija backend, banco, migration ou RBAC.
- Os comandos de Vitest, typecheck, `pnpm verify` e Playwright estão explicitamente definidos.
- Não há placeholders de implementação.

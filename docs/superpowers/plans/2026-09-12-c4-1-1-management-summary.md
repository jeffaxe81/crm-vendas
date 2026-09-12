# C4.1.1 Management Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execução sequencial nesta sessão; agentes somente após escolha explícita do usuário.

**Goal:** Entregar resumo gerencial atual, correto e isolado por organização.

**Architecture:** Agregação no PostgreSQL através da API NestJS e contratos Zod compartilhados. Uma nova seção em apps/web consome os totais; nenhuma lista paginada serve como fonte dos cálculos. Transação com snapshot consistente mantém a configuração tenant existente.

**Tech Stack:** Node 24.20.x, pnpm 11.3.0, TypeScript, NestJS, Prisma/PostgreSQL, Next.js/React, Jest, Vitest e Playwright, conforme lockfile.

**Spec:** docs/superpowers/specs/2026-09-12-c4-1-1-management-summary-design.md

## Global Constraints

- Somente ADMIN/MANAGER recebem reports.read; preservar demais permissões.
- Contexto de organização exclusivamente da sessão; RLS sem bypass.
- Consulta de retrato atual; deletedAt nulo; nenhum filtro por período.
- Soma Decimal transmitida como string com duas casas; nunca chamar Number para somar ou formatar o valor.
- Vencido significa PENDING e dueAt < asOf. Prazo nulo não é vencido.
- Nenhum schema/migration, serviço externo, exportação, IA ou promoção do legado.
- TDD: registrar falha funcional antes de implementar. Erros de infraestrutura não são RED funcional.
- Nenhum merge sem aprovação explícita. GREEN antigo não valida esta entrega.

## Preparação segura

- [ ] Ler a spec, este plano e qualquer AGENTS.md vigente; conferir remote, status e main. Usar using-git-worktrees na execução para escolher isolamento. Preservar arquivos locais não rastreados da especificação.
- [ ] Partir do commit documental fbab127045382f423437280479b6e7cff598fd08 ou sucessor que contenha este plano. Confirmar eventual avanço da main antes de integrar mudanças. Não escrever na main.
- [ ] Conferir node --version, pnpm --version e docker compose version. Instalar somente com pnpm install --frozen-lockfile; não atualizar dependências para contornar falhas.
- [ ] Preparar PostgreSQL descartável para testes seguindo .github/workflows/ci.yml: migrations com MIGRATION_DATABASE_URL, role de aplicação NOBYPASSRLS, DATABASE_URL apontando para essa role. Nunca executar os testes que truncam tabelas em banco real. Só prosseguir após validar que ambas as URLs apontam para o ambiente descartável.

## Task 1 — Contrato de resposta e permissão

**Files:** criar packages/contracts/src/management-summary.ts e management-summary.test.ts; alterar packages/contracts/src/index.ts e apps/api/src/authorization/permissions.ts; testar apps/api/src/authorization/permissions.spec.ts.

**Interfaces:** ManagementSummarySchema e type ManagementSummary exportados por @axes/contracts; Permission passa a incluir reports.read.

- [ ] Escrever os testes de contrato e perfis antes das alterações, incluindo:

```ts
expect(roleHasPermission("ADMIN", "reports.read")).toBe(true);
expect(roleHasPermission("MANAGER", "reports.read")).toBe(true);
expect(roleHasPermission("SELLER", "reports.read")).toBe(false);
expect(roleHasPermission("VIEWER", "reports.read")).toBe(false);
```

- [ ] Rodar pnpm --filter @axes/contracts test e pnpm --filter @axes/api test --runTestsByPath src/authorization/permissions.spec.ts. Registrar primeiro a ausência do contrato/permissão; depois assegurar que casos inválidos falham por validação, não só import.
- [ ] Implementar contrato e exportações:

```ts
import { z } from "zod";
export const ManagementSummarySchema = z.object({
  asOf: z.string().datetime(),
  opportunitiesByStage: z.array(z.object({
    pipelineId: z.string().uuid(), pipelineName: z.string(),
    stageId: z.string().uuid(), stageName: z.string(),
    count: z.number().int().nonnegative(),
  })),
  openEstimatedValue: z.string().regex(/^\d+\.\d{2}$/),
  pendingActivities: z.number().int().nonnegative(),
  overdueActivities: z.number().int().nonnegative(),
  undatedActivities: z.number().int().nonnegative(),
});
export type ManagementSummary = z.infer<typeof ManagementSummarySchema>;
```

- [ ] Adicionar reports.read em PERMISSIONS e somente às listas ADMIN e MANAGER, sem incluí-la em READ_ONLY ou COMMERCIAL_WRITE. Testar rejeição de valor numérico no lugar de string decimal, casas inválidas, contagem negativa/fracionária e data inválida.
- [ ] Reexecutar testes e build de contratos; revisar diff; commit testado: feat(reports): define management summary contract and permission.

## Task 2 — Snapshot consistente tenant-aware

**Files:** alterar apps/api/src/database/prisma.service.ts; criar apps/api/src/database/tenant-snapshot.integration.spec.ts.

**Interfaces:** withTenant<T>(organizationId, callback, options?) mantém chamadas existentes; options é { isolationLevel?: Prisma.TransactionIsolationLevel }.

- [ ] Escrever teste com duas conexões reais: transação A lê um registro; conexão B altera e confirma; A lê novamente. Usar barreiras Promise explícitas, não sleeps. Sob RepeatableRead, o valor em A deve permanecer igual, e uma nova transação deve observar a atualização.

```ts
expect(secondReadInSameTransaction).toEqual(firstReadInSameTransaction);
expect(readAfterCommit).not.toEqual(firstReadInSameTransaction);
```

- [ ] Rodar pnpm --filter @axes/api test --runTestsByPath src/database/tenant-snapshot.integration.spec.ts; observar falha antes de suportar options.
- [ ] Estender o helper sem mudar o padrão dos consumidores existentes:

```ts
async withTenant<T>(
  organizationId: string,
  callback: (tenant: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
): Promise<T> {
  return this.$transaction(async tenant => {
    await tenant.$executeRaw`
      SELECT set_config('app.current_organization_id', ${organizationId}, true)
    `;
    return callback(tenant);
  }, options);
}
```

- [ ] Reexecutar teste e suítes RLS existentes; confirmar ausência de contexto continua fail-closed. Commit: feat(database): allow explicit tenant snapshot isolation.

## Task 3 — Endpoint e cálculos no banco

**Files:** criar apps/api/src/reports/management-summary.service.ts, reports.controller.ts, reports.module.ts, management-summary.integration.spec.ts; alterar apps/api/src/app.module.ts.

**Interfaces:** ManagementSummaryService.read(organizationId: string): Promise<ManagementSummary>; GET /api/v1/reports/management-summary. Imports de DatabaseModule e AuthorizationModule seguem ActivitiesModule.

- [ ] Criar fixture de integração no padrão opportunities.integration.spec.ts, com Nest AppModule, prefixo api/v1, filtro de erro e login real. Fixtures só em banco descartável. Testar endpoint ausente inicialmente (404, esperado 200 para administrador).

```ts
const response = await request(app.getHttpServer())
  .get("/api/v1/reports/management-summary")
  .set("Authorization", `Bearer ${adminToken}`)
  .expect(200);
expect(response.body.openEstimatedValue).toBe("0.30");
expect(response.body.pendingActivities).toBe(3);
expect(response.body.overdueActivities).toBe(1);
expect(response.body.undatedActivities).toBe(1);
```

- [ ] Usar duas oportunidades OPEN de 0.10 e 0.20, uma WON de 500, uma LOST de 600 e uma excluída de 900. Criar três pendentes (vencida, futura e sem prazo), uma concluída e uma cancelada. Adicionar tenant B com valores distintos. Verificar grupos por IDs, inclusive nomes iguais entre funis, registros em etapas inativas e mais de 100 oportunidades para demonstrar independência de paginação.
- [ ] Rodar pnpm --filter @axes/api test --runTestsByPath src/reports/management-summary.integration.spec.ts e registrar RED funcional.
- [ ] Implementar o controller com AuthenticationGuard, PermissionsGuard e RequirePermissions("reports.read"). Recusar query não vazia com 400; principal ausente com 401. Ler organizationId de request.principal conforme AuthenticatedRequest; nunca derivar da query/body. Serviço recebe somente organizationId.
- [ ] Implementar read sob withTenant com RepeatableRead; capturar asOf uma vez dentro da transação. groupBy de oportunidades por pipelineId/stageId com deletedAt null; consultar metadados dos IDs retornados dentro da mesma transação e ordenar por pipeline.name, pipeline.id, stage.position, stage.id após conferir o nome de ordenação no schema. Falta de metadados é erro, nunca total silenciosamente descartado.

```ts
const sum = await tenant.opportunity.aggregate({
  where: { deletedAt: null, stage: { kind: "OPEN" } },
  _sum: { estimatedValue: true },
});
const openEstimatedValue = sum._sum.estimatedValue?.toFixed(2) ?? "0.00";
const pending = { deletedAt: null, status: "PENDING" as const };
const pendingActivities = await tenant.activity.count({ where: pending });
const overdueActivities = await tenant.activity.count({
  where: { ...pending, dueAt: { lt: asOf } },
});
const undatedActivities = await tenant.activity.count({
  where: { ...pending, dueAt: null },
});
```

- [ ] Testar ADMIN/MANAGER 200, SELLER/VIEWER 403, anônimo 401, query organizationId 400, ausência de visibilidade cross-tenant, soma grande exata e empty com 0.00. Para limite dueAt = asOf controlar somente Date no teste, sem falsificar timers do driver PostgreSQL; validar comparação estrita.
- [ ] Injetar erro de banco em teste de tratamento: HTTP 5xx, nunca 200 com zeros. Testar resposta pelo schema. Reexecutar API e contratos; commit: feat(reports): add tenant-isolated management summary API.

## Task 4 — Tela e navegação autorizada

**Files:** criar apps/web/src/app/reports/management-summary-view.tsx e management-summary-view.test.tsx; alterar apps/web/src/app/crm-shell.tsx e page.tsx; criar apps/web/src/app/page-reports-navigation.test.tsx. Estilos em apps/web/src/app/globals.css somente se necessário.

**Interfaces:** ManagementSummaryView({ accessToken }: { accessToken: string }); CrmSection inclui reports. Consome ManagementSummarySchema via apiRequest<unknown>.

- [ ] Escrever testes Testing Library no padrão dos testes existentes. Resposta simulada pertence ao contrato, não testar chamadas mock como resultado de negócio:

```tsx
render(<ManagementSummaryView accessToken="test-token" />);
expect(await screen.findByRole("table")).toBeVisible();
expect(screen.getByText("Valor estimado em aberto")).toBeVisible();
expect(screen.getByText("Atividades sem prazo")).toBeVisible();
```

- [ ] Rodar pnpm --filter @axes/web test src/app/reports/management-summary-view.test.tsx src/app/page-reports-navigation.test.tsx; observar RED para nova tela e navegação.
- [ ] Implementar carregamento com useEffect e flag de descarte no cleanup; não deixar resposta antiga sobrescrever sessão nova. Estados separados para loading, data e error; em nova requisição limpar erro e dados anteriores.

```ts
const payload = await apiRequest<unknown>("/reports/management-summary", {
  accessToken,
});
const parsed = ManagementSummarySchema.parse(payload);
```

- [ ] Exibir cards sem gráficos, tabela sem agrupar só por nome, horário com elemento time dateTime={data.asOf}; preservar valor decimal como texto, permitindo troca textual de ponto por vírgula sem Number. Texto explícito: valor estimado, não faturamento. Sem dados mostra mensagem e zeros reais; erro mostra role alert e Tentar novamente sem cards zerados.
- [ ] No shell condicionar botão Resumo gerencial a reports.read. Na Home renderizar a seção somente com a mesma permissão; manter empresas como inicial. Não promover nenhuma tela do legado.
- [ ] Testar quatro perfis, carregamento, resposta válida, vazia, erro e retry, schema inválido, desmontagem durante fetch e números grandes preservados. Reexecutar Web; commit: feat(web): add authorized management summary view.

## Task 5 — E2E, manual e fechamento

**Files:** criar tests/e2e/management-summary.spec.ts, docs/manuals/c4-1-1-management-summary.md e docs/checkpoints/c4-1-1-management-summary.md; atualizar CHANGELOG.md e docs/roadmap.md apenas para registrar C4.1.1, sem marcar toda Fase 2 concluída.

- [ ] Criar E2E usando o padrão de login e fixtures em tests/e2e/crm-core.spec.ts. Criar dados via APIs autenticadas no banco descartável, navegar ao resumo e comparar valores conhecidos antes/depois de reload. Executar também cenário de sessão sem reports.read.

```ts
await page.getByRole("button", { name: "Resumo gerencial" }).click();
await expect(page.getByRole("table")).toBeVisible();
await expect(page.getByText("Valor estimado em aberto")).toBeVisible();
await expect(page.getByText("0,30", { exact: true })).toBeVisible();
await page.reload();
await page.getByRole("button", { name: "Resumo gerencial" }).click();
await expect(page.getByText("0,30", { exact: true })).toBeVisible();
```

- [ ] Documentar acesso ADMIN/MANAGER, as cinco regras, instante da consulta, vencimento estrito, prazo nulo, exclusão lógica, estimativa versus faturamento, ausência de multimoeda, erro/retry e ausência de filtros/exportação. Registrar a divergência histórica do MVP-08 sem reescrever a release fechada.
- [ ] Executar o gate de .github/workflows/ci.yml no SHA candidato: pnpm install --frozen-lockfile; Prisma generate; migrations e provisionamento role; pnpm verify; bootstrap:admin; Playwright Chromium; pnpm test:e2e; docker compose config --quiet; docker compose build api web. Não executar migrations/truncates antes de confirmar banco de teste.
- [ ] Registrar cada resultado, SHA e limites de validação no checkpoint. Se documentação alterar o SHA, exigir novo gate integral nesse SHA antes de aprovação final.
- [ ] Revisar git diff --check e diff completo; commit: docs(reports): document C4.1.1 verification and operations. Preparar PR sem auto-merge; marcar pronto apenas com gate técnico comprovado. Pedir aprovação explícita para integrar.

## Revisão do plano

- Regras e precisão decimal: Tasks 1 e 3.
- RLS, snapshot e RBAC: Tasks 1, 2 e 3.
- Tela, navegação, horário e estados: Task 4.
- Testes adversariais, E2E, Docker, documentação e merge controlado: Task 5.
- Todas as cinco métricas usam o mesmo contrato; nenhuma tarefa expande o escopo funcional aprovado.

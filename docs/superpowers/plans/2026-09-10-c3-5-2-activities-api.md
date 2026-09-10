# C3.5.2 Activities API Implementation Plan

**Goal:** Expor o domínio `Activity` pela API REST canônica com tenant isolation, RBAC, validação de referências e auditoria.

**Base:** `main` após integração da C3.5.1 e registro do design C3.5.2.

## Task 1 — RED do contrato REST

**Create:** `apps/api/src/activities/activities.integration.spec.ts`

- [ ] provar `POST /activities` para ADMIN/SELLER;
- [ ] provar list/read restritos ao tenant;
- [ ] provar `VIEWER` recebe 403 em mutação;
- [ ] provar empresa/contato cross-tenant rejeitados sem vazamento;
- [ ] provar responsável sem membership ativa é rejeitado;
- [ ] provar PATCH de status controla `completedAt/cancelledAt`;
- [ ] provar soft delete torna recurso invisível;
- [ ] provar trilha de auditoria.

Executar CI e confirmar RED pela ausência das rotas/módulo Activities, não por lint/format/typecheck incidental.

## Task 2 — Contratos compartilhados

**Create:** `packages/contracts/src/activities.ts`
**Modify:** `packages/contracts/src/index.ts`

- [ ] schemas de tipo/status/prioridade compatíveis com Prisma;
- [ ] `ActivityCreateInputSchema`;
- [ ] `ActivityUpdateInputSchema`;
- [ ] contrato de filtros/paginação.

## Task 3 — GREEN mínimo da API

**Create:**
- `apps/api/src/activities/activities.controller.ts`
- `apps/api/src/activities/activities.service.ts`
- `apps/api/src/activities/activities.module.ts`

**Modify:** `apps/api/src/app.module.ts`

- [ ] rotas GET list/read;
- [ ] POST create;
- [ ] PATCH update/status;
- [ ] DELETE soft delete;
- [ ] guards `activity.read`/`activity.write`;
- [ ] todas as operações em `withTenant`;
- [ ] validação tenant-aware de company/contact/owner membership;
- [ ] timestamps de conclusão/cancelamento controlados pelo servidor;
- [ ] auditoria segura.

## Task 4 — Gate e documentação

- [ ] suíte específica GREEN;
- [ ] gate completo GREEN: migrations, source/tests, E2E, Compose e imagens;
- [ ] atualizar `CHANGELOG.md`;
- [ ] criar checkpoint C3.5.2;
- [ ] PR pronto para revisão, sem merge automático.

## Commits sugeridos

1. `test(api): define RED activity API contract`
2. `feat(api): add activity REST contracts`
3. `feat(api): implement tenant-aware activities API`
4. `docs: record C3.5.2 activities API`

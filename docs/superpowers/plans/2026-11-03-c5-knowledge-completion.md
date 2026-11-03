# Cycle 5 Knowledge Hub Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o Cycle 5 preservando o Dashboard já existente e entregando o Hub de Conhecimento com notas, links, documentos e metadados passivos preparados para futura IA.

**Architecture:** Reutilizar o monólito modular, RBAC, auditoria, Prisma e RLS atuais. Knowledge será um domínio próprio com relações explícitas para Empresa/Contato/Oportunidade e storage local atrás de uma interface substituível; documentos não serão persistidos como bytes no PostgreSQL.

**Tech Stack:** TypeScript, Zod, NestJS 12, Prisma 7/PostgreSQL 18, Next.js/React, Vitest/Jest/Playwright, filesystem Node.

**Spec:** `docs/superpowers/specs/2026-11-03-c5-knowledge-completion.md`

## Global Constraints

- Branch isolada: `feat/c5-knowledge-completion-20261103`.
- Base: `main@4d88c64671fbccd13502c560c73392b07f56fc94`.
- DSH-001 não será reimplementado; apenas preservado e revalidado.
- Sem IA, RAG, embeddings, OCR ou banco vetorial.
- Sem nova dependência npm para upload/storage.
- Documento máximo: 10 MiB após decode base64.
- Download sempre como attachment.
- `PRIVATE` é visível somente ao autor.
- Preservar RLS, `organizationId`, auditoria e os perfis atuais.
- Testes primeiro; nenhum merge antes do gate integral verde e aprovação pós-testes.

## Review Focus

- Documento com base64 inválido, vazio ou acima de 10 MiB deve falhar sem gravar arquivo parcial.
- Nome de arquivo com path traversal nunca influencia o storage key ou caminho físico.
- `PRIVATE` de usuário A não pode ser lido/baixado por usuário B do mesmo tenant.
- Relações company/contact/opportunity de outro tenant retornam 404 e não criam joins.
- Soft delete bloqueia leitura/download e não deixa item nas listagens.

---

### Task 1: Contratos, schema e migration

**Files:**

- Create: `packages/contracts/src/knowledge.ts`
- Create: `packages/contracts/src/knowledge.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/workspace-preferences.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261103164500_c5_knowledge_hub/migration.sql`
- Create: `apps/api/src/knowledge/knowledge-schema.integration.spec.ts`

**Interfaces:**

- Produces `KnowledgeItemTypeSchema`, `KnowledgeAccessLevelSchema`, `KnowledgeAiStatusSchema`, `KnowledgeCreateInputSchema`, `KnowledgeUpdateInputSchema`, `KnowledgeListQuerySchema`.
- Produces Prisma models `KnowledgeItem`, `KnowledgeCompany`, `KnowledgeContact`, `KnowledgeOpportunity`.
- Workspace destination `knowledge` requires `knowledge.read`.

- [ ] **Step 1:** escrever RED dos contratos para NOTE/LINK/DOCUMENT, URL somente http/https, relations únicas e limite 20.
- [ ] **Step 2:** escrever RED estrutural verificando novas tabelas/enums/RLS em PostgreSQL.
- [ ] **Step 3:** executar `pnpm --filter @axes/contracts test -- --runInBand` e o teste API focado; confirmar RED.
- [ ] **Step 4:** implementar schemas Zod e exportá-los.
- [ ] **Step 5:** adicionar enums/modelos Prisma, índices, relações, soft delete e constraints type-specific.
- [ ] **Step 6:** criar migration reproduzível com políticas RLS seguindo o padrão das tabelas comerciais existentes.
- [ ] **Step 7:** executar Prisma generate/migrate e testes focados GREEN.
- [ ] **Step 8:** commit.

### Task 2: Knowledge API core — notas, links, acesso e relações

**Files:**

- Create: `apps/api/src/knowledge/knowledge.module.ts`
- Create: `apps/api/src/knowledge/knowledge.controller.ts`
- Create: `apps/api/src/knowledge/knowledge.service.ts`
- Create: `apps/api/src/knowledge/knowledge.integration.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- `GET /api/v1/knowledge`
- `GET /api/v1/knowledge/:id`
- `POST /api/v1/knowledge`
- `PATCH /api/v1/knowledge/:id`
- `DELETE /api/v1/knowledge/:id`
- Reads require `knowledge.read`; writes require `knowledge.write`.

- [ ] **Step 1:** escrever RED criando/listando NOTE e LINK no tenant ativo.
- [ ] **Step 2:** adicionar RED cross-tenant para item e relações.
- [ ] **Step 3:** adicionar RED de `PRIVATE` entre dois usuários do mesmo tenant.
- [ ] **Step 4:** adicionar RED de VIEWER 403 em escrita.
- [ ] **Step 5:** implementar controller/service mínimo com paginação, busca, filtro de tipo e validação das relações.
- [ ] **Step 6:** registrar `knowledge.created|updated|deleted` sem conteúdo binário/base64.
- [ ] **Step 7:** executar testes focados e regressão API GREEN.
- [ ] **Step 8:** commit.

### Task 3: Document storage e download seguro

**Files:**

- Create: `apps/api/src/knowledge/knowledge-storage.ts`
- Create: `apps/api/src/knowledge/local-knowledge-storage.ts`
- Create: `apps/api/src/knowledge/local-knowledge-storage.spec.ts`
- Create: `apps/api/src/knowledge/knowledge-documents.integration.spec.ts`
- Modify: `apps/api/src/knowledge/knowledge.module.ts`
- Modify: `apps/api/src/knowledge/knowledge.service.ts`
- Modify: `apps/api/src/knowledge/knowledge.controller.ts`
- Modify: `compose.yaml`
- Modify: `.gitignore`

**Interfaces:**

- `KnowledgeStorage.put(itemId, input) -> { storageKey, sizeBytes, sha256 }`
- `KnowledgeStorage.get(storageKey) -> Buffer`
- `KnowledgeStorage.remove(storageKey) -> Promise<void>`
- `GET /api/v1/knowledge/:id/document` retorna attachment autorizado.

- [ ] **Step 1:** escrever RED do adapter local: storage key segura, SHA-256, get/remove e path traversal.
- [ ] **Step 2:** escrever RED API: DOCUMENT válido, base64 inválido, >10 MiB, download e soft-delete.
- [ ] **Step 3:** implementar adapter filesystem usando apenas `node:fs/promises`, `node:path` e `node:crypto`.
- [ ] **Step 4:** integrar create/update/document download; nunca auditar base64.
- [ ] **Step 5:** adicionar `KNOWLEDGE_STORAGE_ROOT=/var/lib/axes-crm/knowledge` e volume `knowledge-data` ao Compose.
- [ ] **Step 6:** garantir limpeza do arquivo se a transação de banco falhar após o put.
- [ ] **Step 7:** executar testes focados, Compose config e regressão API GREEN.
- [ ] **Step 8:** commit.

### Task 4: Hub Web e navegação

**Files:**

- Create: `apps/web/src/app/knowledge/knowledge-view.tsx`
- Create: `apps/web/src/app/knowledge/knowledge-view.test.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/crm-shell.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `packages/contracts/src/workspace-preferences.ts`
- Modify: `apps/web/src/i18n/catalogs/pt-BR.json`
- Modify: `apps/web/src/i18n/catalogs/en.json`
- Modify: `apps/web/src/i18n/catalogs/es.json`

**Interfaces:**

- Workspace section `knowledge`.
- Consome API da Task 2/3.
- `canWrite = session.permissions.includes("knowledge.write")`.

- [ ] **Step 1:** escrever RED da navegação exibindo Hub somente com `knowledge.read`.
- [ ] **Step 2:** escrever RED da listagem/busca/filtro e estado vazio.
- [ ] **Step 3:** escrever RED criando NOTE e LINK.
- [ ] **Step 4:** escrever RED criando DOCUMENT a partir de `File`, convertendo para base64 e baixando como attachment.
- [ ] **Step 5:** escrever RED de VIEWER sem ações de escrita.
- [ ] **Step 6:** implementar view acessível, responsiva e integração no App Shell/page.
- [ ] **Step 7:** exibir acesso, relações e `aiStatus` apenas informativamente.
- [ ] **Step 8:** executar testes Web GREEN e regressão.
- [ ] **Step 9:** commit.

### Task 5: E2E, documentação, segurança e gate final

**Files:**

- Create: `tests/e2e/knowledge-hub.spec.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/checkpoints/cycle-5-current.md`
- Modify: PR checklist/body.

**Interfaces:**

- Fecha DSH-001 + KNW-001 + KNW-002.
- Produz evidência e instrução de rollback.

- [ ] **Step 1:** escrever E2E: login -> Hub -> criar nota -> criar link -> criar documento pequeno -> reload -> restaurar sessão -> verificar itens -> baixar documento.
- [ ] **Step 2:** executar `pnpm test:e2e` RED/GREEN.
- [ ] **Step 3:** revisar security: toda query por ID inclui tenant; PRIVATE; VIEWER; relações cross-tenant; path traversal; logs/audit sem base64.
- [ ] **Step 4:** documentar DSH-001 como preexistente, migration do Knowledge Hub, storage/backup e rollback.
- [ ] **Step 5:** executar gate integral no mesmo SHA:

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

- [ ] **Step 6:** fazer revisão final do diff completo e corrigir apenas findings bloqueantes com RED -> GREEN.
- [ ] **Step 7:** atualizar PR com evidência exata do gate.
- [ ] **Step 8:** criar checkpoint `v0.5.0-dashboard-knowledge` somente após gate integral verde e aprovação pós-testes.
- [ ] **Step 9:** não mergear sem aprovação explícita do responsável pelo produto.

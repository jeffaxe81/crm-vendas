# Backup Global Orphan Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar inventário global somente leitura de backups físicos e catálogo, identificando órfãos e inconsistências sem desabilitar RLS ou alterar dados.

**Architecture:** O `BackupStore` ganha um iterador assíncrono seguro de entradas físicas. Um novo serviço agrega o catálogo consultando cada organização por `withTenant`, cruza os UUIDs com o iterador físico e expõe somente metadados sanitizados por uma rota de Superusuário.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL FORCE RLS, Node.js fs/promises, Jest, pnpm, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-24-backup-global-orphan-inventory-design.md`

## Global Constraints

- somente leitura: nenhum unlink, rename, update ou delete;
- não usar `BYPASSRLS`, credencial de migration/deployment ou conexão privilegiada no runtime;
- não expor caminho físico nem nome de entrada inesperada;
- endpoint apenas para sessão humana Superusuário;
- objetos temporários não são órfãos;
- estados transitórios não geram `MISSING`;
- CI integral do SHA candidato antes de qualquer merge;
- CI verde não equivale a homologação nem GO operacional.

## Review Focus

1. Symlink chamado `<uuid>.backup` não pode ser seguido — teste em Task 1.
2. Arquivo temporário simultâneo a `put` não pode ser marcado como órfão — teste em Task 1/2.
3. Objeto de outro tenant não pode ser perdido pela RLS durante agregação — teste PostgreSQL em Task 2.
4. Registro `RUNNING/DELETING` sem objeto não pode virar falso `MISSING` — teste em Task 2.
5. Nenhuma rota/nome inesperado deve aparecer na resposta — teste HTTP em Task 3.

---

### Task 1: Enumeração segura do BackupStore

**Files:**
- Modify: `apps/api/src/data-management/backup-store.ts`
- Modify: `apps/api/src/data-management/backup-store.spec.ts`

**Interfaces:**
- Produces: `BackupStore.inventoryEntries(): AsyncGenerator<BackupStoreInventoryEntry>`
- Produces: discriminated union `BackupStoreInventoryEntry` with `OBJECT | UNREADABLE_OBJECT | TEMPORARY | UNEXPECTED`.

- [ ] **Step 1: Write failing tests**

Add tests proving:
- two valid UUID backups are yielded as `OBJECT` with their physical sizes;
- a symlink named `<uuid>.backup` is `UNREADABLE_OBJECT`, never followed;
- a `.<uuid>.<uuid>.tmp` entry is `TEMPORARY`;
- an arbitrary file is `UNEXPECTED` and its name/path is not present in the yielded value;
- enumeration is read-only and leaves every entry in place.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/api test -- backup-store.spec.ts --runInBand`
Expected: FAIL because `inventoryEntries` does not exist.

- [ ] **Step 3: Implement minimal iterator**

Use `opendir()`/async iteration, call existing `requireDirectory()`, parse only canonical UUID `.backup` names and delegate safe object inspection to `objectSize()`. Never expose directory paths or unexpected names.

- [ ] **Step 4: Run GREEN**

Run the targeted test, then `pnpm --filter @axes/api test -- --runInBand`.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(backup): enumerate stored objects safely`

---

### Task 2: Serviço global de inventário com RLS preservado

**Files:**
- Create: `apps/api/src/data-management/backup-storage-inventory.service.ts`
- Create: `apps/api/src/data-management/backup-storage-inventory.integration.spec.ts`
- Modify: `apps/api/src/data-management/data-management.module.ts`

**Interfaces:**
- Consumes: `BackupStore.inventoryEntries()`.
- Produces: `BackupStorageInventoryService.scan(): Promise<StorageGlobalInventoryResult>`.

- [ ] **Step 1: Write failing PostgreSQL tests**

Create at least three organizations using owner fixture, then exercise the service with the restricted application role. Assert:
- catalog records from all organizations are discovered only through separate `withTenant` scopes;
- physical UUID absent from all catalog rows is `ORPHAN`;
- completed catalog row without file is `MISSING`;
- completed file with wrong physical size is `SIZE_MISMATCH`;
- valid files contribute correct per-tenant and global physical bytes;
- `RUNNING` and `DELETING` without a file are not `MISSING`;
- `DELETED` with a physical file is reported as state inconsistency, not auto-deleted;
- temporary/unexpected entries are counted but names are absent;
- all database rows and files still exist after scan;
- store `null` yields `configured=false`, `complete=false`.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @axes/api test -- backup-storage-inventory.integration.spec.ts --runInBand`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement minimal service**

List only organization IDs globally. Page each organization's backup catalog inside `prisma.withTenant(organizationId, ...)`, build the referenced UUID map, consume the filesystem iterator and calculate sanitized findings/aggregates. Do not use maintenance bypass or migration connection.

- [ ] **Step 4: Run GREEN**

Run targeted test and then the full API suite.
Expected: PASS with restricted role and RLS assertions intact.

- [ ] **Step 5: Commit**

Commit: `feat(backup): add global read-only storage inventory`

---

### Task 3: Endpoint Superusuário e contrato HTTP

**Files:**
- Modify: `apps/api/src/data-management/tenant-storage-allocation.controller.ts`
- Modify: `apps/api/src/data-management/data-management.module.ts`
- Create: `apps/api/src/data-management/backup-storage-inventory.controller.spec.ts` only if the existing controller test cannot cleanly host the cases.

**Interfaces:**
- Produces: `GET /api/v1/admin/storage/inventory`.
- No query/body parameters.

- [ ] **Step 1: Write failing HTTP/boundary tests**

Assert:
- unauthenticated request is 401;
- ordinary admin/session is 403;
- API key is 403;
- Superusuário session gets 200;
- response has `Cache-Control: no-store`;
- response includes no filesystem paths or unexpected filenames;
- endpoint exposes no mutating method.

- [ ] **Step 2: Run RED**

Run the focused controller/integration test.
Expected: FAIL because endpoint/provider is absent.

- [ ] **Step 3: Implement endpoint**

Inject `BackupStorageInventoryService` into the existing `admin/storage` controller and add `GET inventory`. Reuse existing guards; do not add a new privilege mechanism.

- [ ] **Step 4: Run GREEN**

Run focused tests and full API suite.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(backup): expose superuser storage inventory`

---

### Task 4: Documentar, revisar e executar gate final

**Files:**
- Modify: `docs/deploy/tenant-backup-storage-reconciliation.md`
- Create: `docs/checkpoints/2026-10-24-backup-orphan-inventory.md`
- Modify: issue/PR body only after evidence exists.

**Interfaces:**
- Documents semantics, limitations and rollback; no runtime behavior.

- [ ] **Step 1: Document behavior and limits**

State explicitly: read-only, no proof of cryptographic integrity/restorability, no automatic cleanup, no quota enforcement, no operational GO, and filesystem/database observation is not an atomic snapshot.

- [ ] **Step 2: Run complete verification on one SHA**

Run through CI:
- frozen lockfile / supply-chain;
- Prisma generate + migrations;
- restricted application role/RLS;
- Prettier, lint, typecheck;
- repository/contracts/Web/API tests;
- production builds;
- E2E;
- Compose validation;
- Docker images;
- source manifest where configured.

- [ ] **Step 3: Security review**

Confirm:
- no BYPASSRLS/deployment DB usage;
- every catalog tenant query runs inside `withTenant`;
- no path/name leakage;
- no filesystem/database mutation in inventory;
- SuperuserGuard requires human session;
- concurrent/transitional state handling is fail-safe.

- [ ] **Step 4: Update PR report**

Record exact HEAD, CI run/job, test counts, known non-blocking warnings and rollback base. Do not merge without explicit approval after the green report.

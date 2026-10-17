import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { TenantStorageReconciliationService } from "./tenant-storage-reconciliation.service";

describe("read-only tenant backup object reconciliation", () => {
  let owner: PrismaService;
  let restricted: PrismaService;
  let service: TenantStorageReconciliationService;
  let storageDirectory: string;
  let store: BackupStore;
  let orgA: string;
  let orgB: string;
  let userId: string;

  const principal = (organizationId: string) =>
    ({
      organizationId,
      userId,
      authMethod: "session",
      isSuperuser: true,
    }) as AuthenticatedPrincipal;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);
    storageDirectory = await mkdtemp(join(tmpdir(), "axes-reconcile-test-"));
    store = new BackupStore({
      directory: storageDirectory,
      key: randomBytes(32),
      maxBytes: 1024 * 1024,
    });
    service = new TenantStorageReconciliationService(restricted, store);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const email = `reconcile-${randomUUID()}@example.test`;
    userId = (
      await owner.user.create({
        data: {
          email,
          emailNormalized: email,
          displayName: "Backup Inspector",
          passwordHash: "synthetic",
        },
      })
    ).id;
    orgA = (
      await owner.organization.create({
        data: { name: "Reconcile A", slug: "reconcile-a" },
      })
    ).id;
    orgB = (
      await owner.organization.create({
        data: { name: "Reconcile B", slug: "reconcile-b" },
      })
    ).id;
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await restricted?.onModuleDestroy();
    if (storageDirectory)
      await rm(storageDirectory, { recursive: true, force: true });
  });

  async function catalogBackup(organizationId: string, bytes: number) {
    return owner.backupRecord.create({
      data: {
        organizationId,
        reason: "MANUAL",
        state: "COMPLETED",
        schemaVersion: 1,
        checksum: "a".repeat(64),
        counts: {},
        completedAt: new Date(),
        byteCount: BigInt(bytes),
      },
    });
  }

  it("compares tenant files, flags missing/mismatched and ignores foreign files", async () => {
    const matching = await catalogBackup(orgA, 60);
    const missing = await catalogBackup(orgA, 80);
    const mismatch = await catalogBackup(orgA, 120);
    const foreign = await catalogBackup(orgB, 500);
    await store.put(matching.id, Buffer.alloc(60));
    await store.put(mismatch.id, Buffer.alloc(20));
    await store.put(foreign.id, Buffer.alloc(500));

    const result = await service.scan(principal(orgA));
    expect(result).toMatchObject({
      configured: true,
      metadataOnly: true,
      catalogCount: 3,
      checkedCount: 3,
      complete: true,
      matchingCount: 1,
      missingCount: 1,
      sizeMismatchCount: 1,
      unreadableCount: 0,
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backupId: missing.id, status: "MISSING" }),
        expect.objectContaining({
          backupId: mismatch.id,
          status: "SIZE_MISMATCH",
        }),
      ])
    );
    expect(result.findings).toHaveLength(2);
    expect(result.findings.some(item => item.backupId === foreign.id)).toBe(
      false
    );
    expect(result.scannedFilesystemBytes).toBe(String(60 + 20 + 2 * 36));
    // Reconciliation is strictly read-only and does not remove objects.
    expect(await store.read(matching.id)).toEqual(Buffer.alloc(60));
    expect(await store.read(mismatch.id)).toEqual(Buffer.alloc(20));
  });

  it("paginates backup records with tenant-scoped cursors", async () => {
    const foreign = await catalogBackup(orgB, 10);
    await owner.backupRecord.createMany({
      data: Array.from({ length: 53 }, (_, index) => ({
        organizationId: orgA,
        reason: "MANUAL" as const,
        state: "COMPLETED" as const,
        schemaVersion: 1,
        checksum: "b".repeat(64),
        counts: {},
        completedAt: new Date(Date.now() - index * 1000),
        byteCount: 10n,
      })),
    });

    const first = await service.scan(principal(orgA));
    expect(first).toMatchObject({
      catalogCount: 53,
      checkedCount: 50,
      complete: false,
      missingCount: 50,
    });
    expect(first.nextCursor).toMatch(/^[a-f0-9-]{36}$/i);

    const second = await service.scan(principal(orgA), first.nextCursor!);
    expect(second).toMatchObject({
      catalogCount: 53,
      checkedCount: 3,
      complete: true,
      nextCursor: null,
      missingCount: 3,
    });
    const examined = [...first.findings, ...second.findings].map(
      finding => finding.backupId
    );
    expect(new Set(examined).size).toBe(53);
    expect(examined).not.toContain(foreign.id);

    for (const invalidCursor of [foreign.id, "../outside", randomUUID()]) {
      await expect(
        service.scan(principal(orgA), invalidCursor)
      ).rejects.toThrow("Cursor de conferência inválido.");
    }
  });

  it("does not imply successful inspection when storage is not configured", async () => {
    await catalogBackup(orgA, 123);
    const unavailable = new TenantStorageReconciliationService(
      restricted,
      null
    );
    expect(await unavailable.scan(principal(orgA))).toMatchObject({
      configured: false,
      catalogCount: 1,
      checkedCount: 0,
      complete: false,
      findings: [],
    });
    expect((await unavailable.scan(principal(orgB))).catalogCount).toBe(0);
  });
});

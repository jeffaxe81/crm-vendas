import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupService } from "./backup.service";
import { BackupStore } from "./backup-store";
import { decodeSnapshot, snapshotDataFingerprint } from "./backup-manifest";
import { stageRestorePreventiveCopy } from "./restore-preventive-copy";

describe("internal preventive restore snapshot under maintenance", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let backups: BackupService;
  let root: string;

  const maxBytes = 8_388_608;
  const workerId = "synthetic-restore-worker";

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-preventive-"));
    store = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes,
    });
    backups = new BackupService(runtime, store, {
      maxBytes,
      snapshotTimeoutMs: 60_000,
    });
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function fixture() {
    const org = await owner.organization.create({
      data: { name: "Preventive restore A", slug: randomUUID() },
    });
    const other = await owner.organization.create({
      data: { name: "Preventive restore B", slug: randomUUID() },
    });
    const email = `restore-preventive-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore operator",
        passwordHash: "synthetic",
      },
    });
    await owner.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    const company = await owner.company.create({
      data: {
        organizationId: org.id,
        legalName: "Original company",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const manual = await backups.create(org.id, user.id, "MANUAL");
    const target = await backups.verify(org.id, manual.id);
    const operation = await owner.dataOperation.create({
      data: {
        organizationId: org.id,
        actorUserId: user.id,
        kind: "RESTORE",
        state: "RUNNING",
        stage: "QUEUED",
        workerId,
        attempts: 1,
        leaseUntil: new Date(Date.now() + 300_000),
      },
    });
    const run = () =>
      runtime.withMaintenance(
        org.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      );
    return { org, other, user, company, operation, target, run };
  }

  it("publishes, authenticates and catalogs a real immutable copy under RLS", async () => {
    const { org, other, company, operation, run } = await fixture();
    const result = await run();
    expect(result.backupId).toBe(operation.id);
    expect(result.currentFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const persisted = await store.read(operation.id);
    const verified = decodeSnapshot(persisted, org.id, maxBytes);
    expect(snapshotDataFingerprint(verified.data)).toBe(
      result.currentFingerprint
    );
    expect(verified.data.Company?.map(row => row.id)).toContain(company.id);

    const state = await runtime.withTenant(org.id, async tx => ({
      backup: await tx.backupRecord.findUniqueOrThrow({
        where: { id: operation.id },
      }),
      operation: await tx.dataOperation.findUniqueOrThrow({
        where: { id: operation.id },
      }),
      audit: await tx.auditLog.findFirst({
        where: {
          action: "restore.preventive_backup_verified",
          entityId: operation.id,
        },
      }),
    }));
    expect(state.backup).toMatchObject({
      reason: "PRE_RESTORE",
      state: "COMPLETED",
      checksum: result.checksum,
      byteCount: BigInt((await store.read(operation.id)).length),
    });
    expect(state.operation.preventiveBackupId).toBe(operation.id);
    expect(state.operation.stage).toBe("PREVENTIVE_VERIFIED");
    expect(state.audit).not.toBeNull();
    expect(
      await runtime.withTenant(other.id, tx =>
        tx.backupRecord.findMany({ where: { id: operation.id } })
      )
    ).toEqual([]);
  });

  it("requires maintenance and an owned, active restore operation", async () => {
    const { org, other, user, operation, target } = await fixture();
    await expect(
      runtime.withTenant(
        org.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");

    await expect(
      runtime.withMaintenance(
        org.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            "wrong-worker",
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_PREVENTIVE_NOT_AUTHORIZED");

    await expect(
      runtime.withMaintenance(
        other.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            other.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
    expect(
      await owner.backupRecord.count({
        where: { id: operation.id },
      })
    ).toBe(0);
  });

  it("adopts a verified orphan after transaction rollback without republishing", async () => {
    const { org, user, operation, target, run } = await fixture();
    await expect(
      runtime.withMaintenance(
        org.id,
        async tx => {
          await stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          );
          throw Error("SYNTHETIC_CRASH_BEFORE_COMMIT");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("SYNTHETIC_CRASH_BEFORE_COMMIT");

    const oldBytes = await store.read(operation.id);
    expect(
      await owner.backupRecord.count({ where: { id: operation.id } })
    ).toBe(0);
    const currentOperation = await owner.dataOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(currentOperation.preventiveBackupId).toBeNull();

    await expect(run()).resolves.toMatchObject({ backupId: operation.id });
    expect(await store.read(operation.id)).toEqual(oldBytes);
    expect(
      await owner.backupRecord.count({
        where: { id: operation.id, state: "COMPLETED" },
      })
    ).toBe(1);
  });

  it("refuses to adopt an orphan whose tenant snapshot changed", async () => {
    const { org, user, company, operation, target } = await fixture();
    await expect(
      runtime.withMaintenance(
        org.id,
        async tx => {
          await stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          );
          throw Error("SYNTHETIC_ROLLBACK");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");

    await owner.company.update({
      where: { id: company.id },
      data: { legalName: "Changed after orphan publication" },
    });
    await expect(
      runtime.withMaintenance(
        org.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_PREVENTIVE_STALE");

    expect(
      await owner.backupRecord.count({
        where: { id: operation.id },
      })
    ).toBe(0);
    expect(
      await owner.company.findUniqueOrThrow({
        where: { id: company.id },
      })
    ).toMatchObject({ legalName: "Changed after orphan publication" });
    // A stale object is retained for safe offline reconciliation.
    expect((await store.read(operation.id)).length).toBeGreaterThan(0);
  });
  it("refuses a target revoked after verification before publishing preventive bytes", async () => {
    const { org, target, user, operation } = await fixture();
    await owner.backupRecord.update({
      where: { id: target.record.id },
      data: { state: "FAILED" },
    });

    await expect(
      runtime.withMaintenance(
        org.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_TARGET_INVALID");

    expect(await store.objectSize(operation.id)).toBeNull();
    expect(
      await owner.dataOperation.findUniqueOrThrow({
        where: { id: operation.id },
      })
    ).toMatchObject({ preventiveBackupId: null });
    expect(
      await owner.backupRecord.count({
        where: { organizationId: org.id, reason: "PRE_RESTORE" },
      })
    ).toBe(0);
  });

  for (const failure of ["missing", "replaced"] as const) {
    it(`rejects a ${failure} restore target before preventive publication`, async () => {
      const { org, target, operation, run } = await fixture();
      await store.remove(target.record.id);
      if (failure === "replaced") {
        // A valid encrypted envelope can still hold the wrong content.
        await store.put(target.record.id, Buffer.from("replaced target"));
      }

      await expect(run()).rejects.toThrow("RESTORE_TARGET_INVALID");
      expect(await store.objectSize(operation.id)).toBeNull();
      expect(
        await owner.backupRecord.count({
          where: { organizationId: org.id, reason: "PRE_RESTORE" },
        })
      ).toBe(0);
      expect(
        await owner.dataOperation.findUniqueOrThrow({
          where: { id: operation.id },
        })
      ).toMatchObject({ preventiveBackupId: null });
    });
  }

  it("preserves transient target read errors for safe retries", async () => {
    const { target, operation, run } = await fixture();
    const originalRead = store.read.bind(store);
    store.read = async id => {
      if (id === target.record.id) {
        throw Object.assign(new Error("synthetic storage outage"), {
          code: "EIO",
        });
      }
      return originalRead(id);
    };
    try {
      await expect(run()).rejects.toThrow("synthetic storage outage");
      expect(await store.objectSize(operation.id)).toBeNull();
    } finally {
      store.read = originalRead;
    }
  });

  it("publishes the preventive copy when a supported Ticket exists only in live state", async () => {
    const { org, user, target, operation } = await fixture();
    const ticket = await owner.ticket.create({
      data: {
        organizationId: org.id,
        protocol: "2026-000321",
        subject: "Protected by preventive copy",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    await expect(
      runtime.withMaintenance(
        org.id,
        tx =>
          stageRestorePreventiveCopy(
            tx,
            org.id,
            user.id,
            operation.id,
            workerId,
            1,
            target,
            store,
            maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).resolves.toMatchObject({ backupId: operation.id });

    expect((await store.objectSize(operation.id)) ?? 0).toBeGreaterThan(0);
    expect(
      await owner.ticket.findUnique({ where: { id: ticket.id } })
    ).not.toBeNull();
  });
});

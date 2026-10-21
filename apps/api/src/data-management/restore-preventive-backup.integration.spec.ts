import { jest } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { decodeSnapshot } from "./backup-manifest";
import { BackupService } from "./backup.service";
import { BackupStore } from "./backup-store";
import { persistPreventiveRestoreBackup } from "./restore-preventive-backup";

describe("encrypted PRE_RESTORE safety copy under tenant maintenance", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let backups: BackupService;
  let directory: string;

  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    directory = await mkdtemp(join(tmpdir(), "axes-pre-restore-"));
    store = new BackupStore({
      directory,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    backups = new BackupService(runtime, store, options);
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
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function fixture() {
    const tenant = await owner.organization.create({
      data: { name: "Preventive A", slug: randomUUID() },
    });
    const other = await owner.organization.create({
      data: { name: "Preventive B", slug: randomUUID() },
    });
    const email = `preventive-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Synthetic Operator",
        passwordHash: "synthetic",
      },
    });
    await owner.organizationMembership.create({
      data: {
        organizationId: tenant.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    await owner.company.create({
      data: {
        organizationId: tenant.id,
        legalName: "Tenant A protected before restore",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await owner.company.create({
      data: {
        organizationId: other.id,
        legalName: "Tenant B must remain untouched",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const backup = await backups.create(tenant.id, user.id, "MANUAL");
    const target = await backups.verify(tenant.id, backup.id);
    const operation = await owner.dataOperation.create({
      data: {
        organizationId: tenant.id,
        actorUserId: user.id,
        kind: "RESTORE",
        state: "RUNNING",
      },
    });
    return { tenant, other, user, backup, target, operation };
  }

  async function copyInMaintenance(
    tenantId: string,
    operationId: string,
    target: Awaited<ReturnType<BackupService["verify"]>>
  ) {
    return runtime.withMaintenance(
      tenantId,
      tx =>
        persistPreventiveRestoreBackup(
          tx,
          tenantId,
          operationId,
          target,
          store,
          options.maxBytes
        ),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );
  }

  it("publishes encrypted authenticated bytes, then catalogs and attaches the copy", async () => {
    const { tenant, other, operation, target } = await fixture();
    const created = await copyInMaintenance(tenant.id, operation.id, target);

    const [catalog, attached, audit] = await runtime.withTenant(
      tenant.id,
      async tx =>
        Promise.all([
          tx.backupRecord.findFirst({
            where: { id: created.backupId, organizationId: tenant.id },
          }),
          tx.dataOperation.findFirst({
            where: { id: operation.id, organizationId: tenant.id },
          }),
          tx.auditLog.findFirst({
            where: {
              requestId: operation.id,
              action: "restore.preventive_backup_verified",
            },
          }),
        ])
    );
    expect(catalog).toMatchObject({
      reason: "PRE_RESTORE",
      state: "COMPLETED",
      checksum: created.checksum,
    });
    expect(attached?.preventiveBackupId).toBe(created.backupId);
    expect(attached?.stage).toBe("PREVENTIVE_BACKUP_READY");
    expect(audit?.entityId).toBe(created.backupId);

    const raw = await readFile(join(directory, `${created.backupId}.backup`));
    expect(raw.includes(Buffer.from("Tenant A protected before restore"))).toBe(
      false
    );
    const decrypted = await store.read(created.backupId);
    const verified = decodeSnapshot(
      decrypted,
      tenant.id,
      options.maxBytes
    );
    expect(verified.manifest.checksum).toBe(created.checksum);
    expect(verified.data.Company).toHaveLength(1);
    expect(() =>
      decodeSnapshot(
        decrypted,
        other.id,
        options.maxBytes
      )
    ).toThrow();
    expect(
      await owner.company.count({ where: { organizationId: other.id } })
    ).toBe(1);
  });

  it("refuses an ordinary tenant transaction before publishing a copy", async () => {
    const { tenant, operation, target } = await fixture();
    const before = await readdir(directory);
    await expect(
      runtime.withTenant(
        tenant.id,
        tx =>
          persistPreventiveRestoreBackup(
            tx,
            tenant.id,
            operation.id,
            target,
            store,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");
    expect(await readdir(directory)).toEqual(before);
    expect(
      await owner.dataOperation.findUnique({ where: { id: operation.id } })
    ).toMatchObject({ preventiveBackupId: null });
  });

  it("refuses a foreign tenant operation without publishing bytes", async () => {
    const { tenant, other, operation, target } = await fixture();
    const before = await readdir(directory);
    await expect(
      copyInMaintenance(other.id, operation.id, target)
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
    expect(await readdir(directory)).toEqual(before);
    expect(
      await owner.company.count({ where: { organizationId: other.id } })
    ).toBe(1);
    expect(
      await owner.backupRecord.count({
        where: { reason: "PRE_RESTORE", organizationId: tenant.id },
      })
    ).toBe(0);
  });

  it("rejects a failed encrypted readback without creating a catalog or binding", async () => {
    const { tenant, operation, target } = await fixture();
    const before = new Set(await readdir(directory));
    const read = jest
      .spyOn(store, "read")
      .mockResolvedValueOnce(Buffer.from("synthetic corrupt readback"));
    try {
      await expect(
        copyInMaintenance(tenant.id, operation.id, target)
      ).rejects.toThrow("RESTORE_PREVENTIVE_BACKUP_INVALID");
    } finally {
      read.mockRestore();
    }
    const unpublished = (await readdir(directory)).filter(
      name => !before.has(name)
    );
    expect(unpublished).toHaveLength(1);
    const id = unpublished[0]!.replace(/\.backup$/, "");
    expect(
      decodeSnapshot(await store.read(id), tenant.id, options.maxBytes)
        .manifest.organizationId
    ).toBe(tenant.id);
    expect(
      await owner.backupRecord.count({
        where: { reason: "PRE_RESTORE", organizationId: tenant.id },
      })
    ).toBe(0);
    expect(
      await owner.dataOperation.findUnique({ where: { id: operation.id } })
    ).toMatchObject({ preventiveBackupId: null });
  });

  it("leaves a private recoverable orphan on SQL rollback, never a false COMPLETED catalog", async () => {
    const { tenant, operation, target } = await fixture();
    let orphanId: string | null = null;
    await expect(
      runtime.withMaintenance(
        tenant.id,
        async tx => {
          const created = await persistPreventiveRestoreBackup(
            tx,
            tenant.id,
            operation.id,
            target,
            store,
            options.maxBytes
          );
          orphanId = created.backupId;
          throw new Error("synthetic rollback after encrypted publication");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("synthetic rollback");
    expect(orphanId).not.toBeNull();
    expect(
      await owner.backupRecord.findUnique({ where: { id: orphanId! } })
    ).toBeNull();
    expect(
      await owner.dataOperation.findUnique({ where: { id: operation.id } })
    ).toMatchObject({ preventiveBackupId: null });
    expect(
      decodeSnapshot(
        await store.read(orphanId!),
        tenant.id,
        options.maxBytes
      ).manifest.organizationId
    ).toBe(tenant.id);
  });

  it("rejects a second publication for an already protected operation", async () => {
    const { tenant, operation, target } = await fixture();
    await copyInMaintenance(tenant.id, operation.id, target);
    const before = await readdir(directory);
    await expect(
      copyInMaintenance(tenant.id, operation.id, target)
    ).rejects.toThrow("RESTORE_PREVENTIVE_BACKUP_REQUIRED");
    expect(await readdir(directory)).toEqual(before);
    expect(
      await owner.backupRecord.count({
        where: { reason: "PRE_RESTORE", organizationId: tenant.id },
      })
    ).toBe(1);
  });
});

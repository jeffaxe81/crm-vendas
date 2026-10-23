import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PasswordService } from "../auth/password.service";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { BackupService } from "./backup.service";
import { BackupStore } from "./backup-store";
import { decodeSnapshot } from "./backup-manifest";
import { DataPreviewService } from "./data-preview.service";
import { RESTORE_CONFIRMATION_PHRASE } from "./restore-confirmation";
import { executeConfirmedRestoreLocked } from "./restore-transaction";

describe("internal atomic restore pipeline under restricted RLS", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let backups: BackupService;
  let previews: DataPreviewService;
  let directory: string;

  const passwords = new PasswordService();
  const pass = "synthetic-atomic-restore-password-123!";
  const workerId = "synthetic-restore";
  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    directory = await mkdtemp(join(tmpdir(), "axes-atomic-restore-"));
    store = new BackupStore({
      directory,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    backups = new BackupService(runtime, store, options);
    previews = new DataPreviewService(runtime, backups, options);
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
    const org = await owner.organization.create({
      data: { name: "Atomic restore A", slug: randomUUID() },
    });
    const other = await owner.organization.create({
      data: { name: "Atomic restore B", slug: randomUUID() },
    });
    const email = `atomic-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore superuser",
        passwordHash: await passwords.hash(pass),
      },
    });
    const membership = await owner.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    const session = await owner.refreshSession.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const company = await owner.company.create({
      data: {
        organizationId: org.id,
        legalName: "Backup version",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const companyOther = await owner.company.create({
      data: {
        organizationId: other.id,
        legalName: "Other tenant unchanged",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const backup = await backups.create(org.id, user.id, "MANUAL");
    const target = await backups.verify(org.id, backup.id);

    await owner.company.update({
      where: { id: company.id },
      data: { legalName: "Changed after backup" },
    });
    const principal: AuthenticatedPrincipal = {
      organizationId: org.id,
      userId: user.id,
      membershipId: membership.id,
      sessionId: session.id,
      authMethod: "session",
      isSuperuser: true,
      permissions: [],
      role: "ADMIN",
    };
    const preview = await previews.previewRestore(principal, backup.id);
    const confirmation = {
      previewId: preview.id,
      password: pass,
      confirmation: RESTORE_CONFIRMATION_PHRASE,
    };
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
        payload: { previewId: preview.id, targetBackupId: backup.id },
      },
    });
    const fence = { operationId: operation.id, workerId, attempts: 1 };
    const run = () =>
      runtime.withMaintenance(
        org.id,
        tx =>
          executeConfirmedRestoreLocked(
            tx,
            principal,
            confirmation,
            fence,
            target,
            passwords,
            store,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      );
    return {
      org,
      other,
      user,
      company,
      companyOther,
      backup,
      target,
      principal,
      preview,
      confirmation,
      operation,
      fence,
      run,
    };
  }

  it("commits confirmed restore, verified preventive backup, audit and fence atomically", async () => {
    const {
      org,
      other,
      company,
      companyOther,
      backup,
      preview,
      operation,
      run,
    } = await fixture();
    const result = await run();

    expect(result.preventiveBackupId).toBe(operation.id);
    expect(result.targetBackupId).toBe(backup.id);
    const persisted = decodeSnapshot(
      await store.read(operation.id),
      org.id,
      options.maxBytes
    );
    expect(persisted.data.Company?.[0]?.legalName).toBe("Changed after backup");

    const [current, external, op, state, copy, restoredAudit] =
      await Promise.all([
        owner.company.findUniqueOrThrow({ where: { id: company.id } }),
        owner.company.findUniqueOrThrow({ where: { id: companyOther.id } }),
        owner.dataOperation.findUniqueOrThrow({
          where: { id: operation.id },
        }),
        owner.operationPreview.findUniqueOrThrow({ where: { id: preview.id } }),
        owner.backupRecord.findUniqueOrThrow({
          where: { id: operation.id },
        }),
        owner.auditLog.findFirst({
          where: { action: "restore.completed", entityId: operation.id },
        }),
      ]);
    expect(current.legalName).toBe("Backup version");
    expect(external).toMatchObject({
      organizationId: other.id,
      legalName: "Other tenant unchanged",
    });
    expect(op).toMatchObject({
      organizationId: org.id,
      state: "COMPLETED",
      stage: "COMPLETED",
      preventiveBackupId: operation.id,
      processed: 1,
      total: 1,
      checkpoint: {
        businessCommitted: true,
        previewId: preview.id,
        targetBackupId: backup.id,
        preventiveBackupId: operation.id,
      },
    });
    expect(op.leaseUntil).toBeNull();
    expect(state.consumedAt).not.toBeNull();
    expect(copy).toMatchObject({
      organizationId: org.id,
      reason: "PRE_RESTORE",
      state: "COMPLETED",
    });
    expect(restoredAudit).not.toBeNull();
    await expect(run()).rejects.toThrow("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  });

  it("rejects wrong credentials and mismatched operation payload without creating a copy", async () => {
    const {
      org,
      preview,
      operation,
      principal,
      confirmation,
      fence,
      target,
      run,
    } = await fixture();

    await expect(
      runtime.withMaintenance(
        org.id,
        tx =>
          executeConfirmedRestoreLocked(
            tx,
            principal,
            { ...confirmation, password: "incorrect" },
            fence,
            target,
            passwords,
            store,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_CONFIRMATION_INVALID");

    await owner.dataOperation.update({
      where: { id: operation.id },
      data: {
        payload: {
          previewId: confirmation.previewId,
          targetBackupId: randomUUID(),
        },
      },
    });
    await expect(run()).rejects.toThrow("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
    expect(await store.objectSize(operation.id)).toBeNull();
    expect(
      await owner.operationPreview.findUniqueOrThrow({
        where: { id: preview.id },
      })
    ).toMatchObject({ consumedAt: null });
    expect(
      await owner.company.findFirstOrThrow({
        where: { organizationId: org.id },
      })
    ).toMatchObject({ legalName: "Changed after backup" });
  });

  it("rejects an expired worker lease before consuming confirmation or publishing", async () => {
    const { operation, preview, run } = await fixture();
    await owner.dataOperation.update({
      where: { id: operation.id },
      data: { leaseUntil: new Date(0) },
    });
    await expect(run()).rejects.toThrow("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
    expect(await store.objectSize(operation.id)).toBeNull();
    expect(
      await owner.operationPreview.findUniqueOrThrow({
        where: { id: preview.id },
      })
    ).toMatchObject({ consumedAt: null });
  });

  it("rolls back a late failure and can safely adopt the orphan on retry", async () => {
    const {
      org,
      operation,
      company,
      preview,
      principal,
      confirmation,
      fence,
      target,
      run,
    } = await fixture();
    await expect(
      runtime.withMaintenance(
        org.id,
        async tx => {
          await executeConfirmedRestoreLocked(
            tx,
            principal,
            confirmation,
            fence,
            target,
            passwords,
            store,
            options.maxBytes
          );
          throw Error("SYNTHETIC_CRASH_AFTER_RESTORE");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("SYNTHETIC_CRASH_AFTER_RESTORE");

    const orphan = await store.read(operation.id);
    expect(
      decodeSnapshot(orphan, org.id, options.maxBytes).data.Company?.[0]
        ?.legalName
    ).toBe("Changed after backup");
    expect(
      await owner.company.findUniqueOrThrow({ where: { id: company.id } })
    ).toMatchObject({ legalName: "Changed after backup" });
    expect(
      await owner.operationPreview.findUniqueOrThrow({
        where: { id: preview.id },
      })
    ).toMatchObject({ consumedAt: null });
    expect(
      await owner.dataOperation.findUniqueOrThrow({
        where: { id: operation.id },
      })
    ).toMatchObject({
      state: "RUNNING",
      preventiveBackupId: null,
      completedAt: null,
    });
    expect(
      await owner.backupRecord.findUnique({ where: { id: operation.id } })
    ).toBeNull();
    expect(
      await owner.auditLog.count({
        where: { action: "restore.completed", entityId: operation.id },
      })
    ).toBe(0);

    await expect(run()).resolves.toMatchObject({
      preventiveBackupId: operation.id,
    });
    expect(await store.read(operation.id)).toEqual(orphan);
    expect(
      await owner.company.findUniqueOrThrow({ where: { id: company.id } })
    ).toMatchObject({ legalName: "Backup version" });
  });
});

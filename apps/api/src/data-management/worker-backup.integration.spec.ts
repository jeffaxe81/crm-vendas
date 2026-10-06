import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BackupRecord, BackupReason } from "@axes/contracts";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { DataOperationWorker } from "./data-operation.worker";

type IdempotentBackupService = BackupService & {
  create(
    organizationId: string,
    actorId: string | null,
    reason: BackupReason,
    requestedId?: string
  ): Promise<BackupRecord>;
  pruneRetention(
    organizationId: string,
    retentionCount: 7 | 15 | 30 | 90
  ): Promise<number>;
};

type ProcessingWorker = DataOperationWorker & {
  processNext(workerId: string): Promise<boolean>;
};

class FailOnceBackupStore extends BackupStore {
  private shouldFail = true;

  override async put(id: string, bytes: Buffer): Promise<void> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error("synthetic backup store failure");
    }
    await super.put(id, bytes);
  }
}

describe("durable backup execution and retention", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let service: IdempotentBackupService;
  let worker: ProcessingWorker;
  let root: string;
  let organizationId: string;

  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }

    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-backup-worker-"));
    store = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    service = new BackupService(
      runtime,
      store,
      options
    ) as IdempotentBackupService;

    const Worker = DataOperationWorker as unknown as new (
      prisma: PrismaService,
      backupService: BackupService
    ) => DataOperationWorker;
    worker = new Worker(runtime, service) as ProcessingWorker;
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    organizationId = (
      await owner.organization.create({
        data: { name: "Worker Backup", slug: "worker-backup" },
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
    await runtime?.onModuleDestroy();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function queueBackup() {
    return runtime.withTenant(organizationId, tx =>
      tx.dataOperation.create({
        data: {
          organizationId,
          kind: "BACKUP",
          payload: { reason: "SCHEDULED" },
        },
      })
    );
  }

  it("uses the operation id as the backup idempotency key and reuses a completed backup", async () => {
    const requestedId = randomUUID();

    const first = await service.create(
      organizationId,
      null,
      "SCHEDULED",
      requestedId
    );
    const second = await service.create(
      organizationId,
      null,
      "SCHEDULED",
      requestedId
    );

    expect(first.id).toBe(requestedId);
    expect(second.id).toBe(requestedId);
    expect(
      await runtime.withTenant(organizationId, tx => tx.backupRecord.count())
    ).toBe(1);
    expect(
      await runtime.withTenant(organizationId, tx =>
        tx.auditLog.count({
          where: { entityId: requestedId, action: "backup.completed" },
        })
      )
    ).toBe(1);
  });

  it("resumes after a committed backup without creating a duplicate and persists the job checkpoint", async () => {
    const operation = await queueBackup();

    const committed = await service.create(
      organizationId,
      null,
      "SCHEDULED",
      operation.id
    );
    expect(committed.id).toBe(operation.id);

    expect(await worker.processNext("worker-restart")).toBe(true);

    await runtime.withTenant(organizationId, async tx => {
      expect(await tx.backupRecord.count()).toBe(1);
      const finished = await tx.dataOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
      expect(finished.state).toBe("COMPLETED");
      expect(finished.stage).toBe("COMPLETED");
      expect(finished.checkpoint).toMatchObject({
        businessCommitted: true,
        backupId: operation.id,
      });
    });
    await expect(store.read(operation.id)).resolves.toBeInstanceOf(Buffer);
  });

  it("retries the same backup operation after a transient store failure without duplicating the catalog row", async () => {
    const retryRoot = await mkdtemp(join(tmpdir(), "axes-backup-retry-"));
    const retryStore = new FailOnceBackupStore({
      directory: retryRoot,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    const retryService = new BackupService(
      runtime,
      retryStore,
      options
    ) as IdempotentBackupService;
    const Worker = DataOperationWorker as unknown as new (
      prisma: PrismaService,
      backupService: BackupService
    ) => DataOperationWorker;
    const retryWorker = new Worker(runtime, retryService) as ProcessingWorker;
    const operation = await queueBackup();

    try {
      await expect(
        retryWorker.processNext("worker-first-attempt")
      ).rejects.toThrow("BACKUP_FAILED");

      await runtime.withTenant(organizationId, async tx => {
        const backup = await tx.backupRecord.findUniqueOrThrow({
          where: {
            id_organizationId: {
              id: operation.id,
              organizationId,
            },
          },
        });
        expect(backup.state).toBe("FAILED");

        const running = await tx.dataOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        expect(running.state).toBe("RUNNING");

        await tx.dataOperation.update({
          where: { id: operation.id },
          data: { leaseUntil: new Date(0) },
        });
      });

      await expect(
        retryWorker.processNext("worker-second-attempt")
      ).resolves.toBe(true);

      await runtime.withTenant(organizationId, async tx => {
        expect(await tx.backupRecord.count()).toBe(1);
        const backup = await tx.backupRecord.findUniqueOrThrow({
          where: {
            id_organizationId: {
              id: operation.id,
              organizationId,
            },
          },
        });
        expect(backup.state).toBe("COMPLETED");

        const completed = await tx.dataOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        expect(completed.state).toBe("COMPLETED");
        expect(completed.checkpoint).toMatchObject({
          businessCommitted: true,
          backupId: operation.id,
        });
      });
      await expect(retryStore.read(operation.id)).resolves.toBeInstanceOf(
        Buffer
      );
    } finally {
      await rm(retryRoot, { recursive: true, force: true });
    }
  });

  it("retains the newest configured backups while preserving a preventive backup in use", async () => {
    const previous: BackupRecord[] = [];

    for (let index = 0; index < 9; index++) {
      const record = await service.create(
        organizationId,
        null,
        "SCHEDULED",
        randomUUID()
      );
      previous.push(record);
      await runtime.withTenant(organizationId, tx =>
        tx.backupRecord.update({
          where: {
            id_organizationId: { id: record.id, organizationId },
          },
          data: {
            completedAt: new Date(Date.UTC(2026, 9, 1, 0, index, 0)),
          },
        })
      );
    }

    await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.create({
        data: {
          organizationId,
          kind: "RESTORE",
          state: "RUNNING",
          workerId: "restore-worker",
          attempts: 1,
          leaseUntil: new Date(Date.now() + 60_000),
          preventiveBackupId: previous[0]!.id,
        },
      })
    );

    expect(await service.pruneRetention(organizationId, 7)).toBe(1);

    const remaining = await runtime.withTenant(organizationId, tx =>
      tx.backupRecord.findMany({
        where: { state: "COMPLETED" },
        orderBy: [{ completedAt: "asc" }, { id: "asc" }],
        select: { id: true },
      })
    );

    expect(remaining.map(row => row.id)).toContain(previous[0]!.id);
    expect(remaining.map(row => row.id)).not.toContain(previous[1]!.id);
    expect(remaining).toHaveLength(8);

    await expect(store.read(previous[0]!.id)).resolves.toBeInstanceOf(Buffer);
    await expect(store.read(previous[1]!.id)).rejects.toThrow();
  });
});

import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BackupRecord, BackupReason } from "@axes/contracts";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { DataOperationWorker } from "./data-operation.worker";
import type { Prisma } from "../generated/prisma/client";

type IdempotentBackupService = BackupService & {
  create(
    organizationId: string,
    actorId: string | null,
    reason: BackupReason,
    requestedId?: string,
    workerFence?: { workerId: string; attempts: number }
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

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
      resolve = done;
    });
    return { promise, resolve };
  }

  for (const interruptedState of ["PENDING", "RUNNING"] as const) {
    it(`adopts a published object after interruption in ${interruptedState}`, async () => {
      const operation = await queueBackup();
      await worker.claimNext("published-before-crash");
      await service.create(organizationId, null, "SCHEDULED", operation.id);
      const published = await store.read(operation.id);
      await runtime.withTenant(organizationId, async tx => {
        await tx.backupRecord.update({
          where: { id_organizationId: { id: operation.id, organizationId } },
          data: { state: interruptedState, checksum: null, completedAt: null },
        });
        await tx.dataOperation.update({
          where: { id: operation.id },
          data: { leaseUntil: new Date(0) },
        });
      });

      await expect(worker.processNext("adopt-after-crash")).resolves.toBe(true);
      const verified = await service.verify(organizationId, operation.id);
      expect(verified.bytes.equals(published)).toBe(true);
      expect((await store.read(operation.id)).equals(published)).toBe(true);
      expect(verified.record.state).toBe("COMPLETED");
    });
  }

  it("validates and adopts the immutable object that wins a publication race", async () => {
    const seed = await service.create(organizationId, null, "SCHEDULED");
    const published = await store.read(seed.id);
    const raceRoot = await mkdtemp(join(tmpdir(), "axes-publication-race-"));
    class RacingBackupStore extends BackupStore {
      override async put(id: string, bytes: Buffer): Promise<void> {
        await super.put(id, published);
        await super.put(id, bytes);
      }
    }
    const raceStore = new RacingBackupStore({
      directory: raceRoot,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    const raceService = new BackupService(runtime, raceStore, options);
    const operation = await queueBackup();
    const claim = await worker.claimNext("publication-winner");
    try {
      await raceService.create(
        organizationId,
        null,
        "SCHEDULED",
        operation.id,
        {
          workerId: "publication-winner",
          attempts: claim!.attempts,
        }
      );
      const verified = await raceService.verify(organizationId, operation.id);
      expect(verified.bytes.equals(published)).toBe(true);
    } finally {
      await rm(raceRoot, { recursive: true, force: true });
    }
  });

  it("rejects an invalid published snapshot without replacing or deleting it", async () => {
    const operation = await queueBackup();
    const claim = await worker.claimNext("invalid-publication");
    const invalid = Buffer.from("authenticated object, invalid snapshot");
    await store.put(operation.id, invalid);

    await expect(
      service.create(organizationId, null, "SCHEDULED", operation.id, {
        workerId: "invalid-publication",
        attempts: claim!.attempts,
      })
    ).rejects.toThrow("BACKUP_INVALID");
    expect((await store.read(operation.id)).equals(invalid)).toBe(true);
    expect(
      (
        await owner.backupRecord.findUniqueOrThrow({
          where: { id_organizationId: { id: operation.id, organizationId } },
        })
      ).state
    ).toBe("FAILED");
  });

  it("stops catalog completion when cancellation arrives during object verification", async () => {
    const operation = await queueBackup();
    const claim = await worker.claimNext("cancel-verification");
    const lease = new AbortController();
    const originalRead = store.read.bind(store);
    let published: Buffer | undefined;
    store.read = async id => {
      const bytes = await originalRead(id);
      published = bytes;
      lease.abort();
      return bytes;
    };
    try {
      await expect(
        service.create(organizationId, null, "SCHEDULED", operation.id, {
          workerId: "cancel-verification",
          attempts: claim!.attempts,
          signal: lease.signal,
        })
      ).rejects.toThrow("BACKUP_IN_PROGRESS");
      expect(published).toBeDefined();
      expect((await originalRead(operation.id)).equals(published!)).toBe(true);
      const row = await owner.backupRecord.findUniqueOrThrow({
        where: { id_organizationId: { id: operation.id, organizationId } },
      });
      expect(row.state).toBe("RUNNING");
      expect(row.checksum).toBeNull();
      expect(
        await owner.auditLog.count({
          where: { entityId: operation.id, action: "backup.completed" },
        })
      ).toBe(0);
    } finally {
      store.read = originalRead;
    }
  });

  it("finishes committed retention cleanup when cancellation arrives after catalog deletion", async () => {
    const records = [];
    for (let index = 0; index < 8; index += 1) {
      records.push(await service.create(organizationId, null, "SCHEDULED"));
    }
    const oldest = records[0]!;
    const lease = new AbortController();
    const original = runtime.withTenant.bind(runtime);
    runtime.withTenant = async function <T>(
      tenantId: string,
      callback: (tx: Prisma.TransactionClient) => Promise<T>,
      settings?: Parameters<PrismaService["withTenant"]>[2]
    ): Promise<T> {
      const result = await original(tenantId, callback, settings);
      if (result === true) lease.abort();
      return result;
    };
    try {
      await expect(
        service.pruneRetention(organizationId, 7, lease.signal)
      ).resolves.toBe(1);
      expect(lease.signal.aborted).toBe(true);
      await expect(store.read(oldest.id)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(
        await owner.backupRecord.count({
          where: { id: oldest.id, organizationId },
        })
      ).toBe(0);
    } finally {
      runtime.withTenant = original;
    }
  });

  it("cannot downgrade a successor's completed backup after an obsolete snapshot resumes", async () => {
    const operation = await queueBackup();
    const former = await worker.claimNext("snapshot-former");
    const paused = deferred();
    const release = deferred();
    const original = runtime.withTenant.bind(runtime);
    let held = false;
    runtime.withTenant = async function <T>(
      tenantId: string,
      callback: (tx: Prisma.TransactionClient) => Promise<T>,
      settings?: Parameters<PrismaService["withTenant"]>[2]
    ): Promise<T> {
      if (!held && settings?.isolationLevel === "RepeatableRead") {
        held = true;
        paused.resolve();
        await release.promise;
      }
      return original(tenantId, callback, settings);
    };
    const obsolete = service.create(
      organizationId,
      null,
      "SCHEDULED",
      operation.id,
      {
        workerId: "snapshot-former",
        attempts: former!.attempts,
      }
    );
    const observed = obsolete.then(
      () => "unexpected-success",
      error => (error as Error).message
    );
    try {
      await paused.promise;
      await owner.dataOperation.update({
        where: { id: operation.id },
        data: { leaseUntil: new Date(0) },
      });
      expect(await worker.processNext("snapshot-successor")).toBe(true);
      release.resolve();
      expect(await observed).toBe("BACKUP_IN_PROGRESS");
      const verified = await service.verify(organizationId, operation.id);
      expect(verified.record.state).toBe("COMPLETED");
      expect(
        (
          await owner.dataOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).state
      ).toBe("COMPLETED");
    } finally {
      release.resolve();
      await observed;
      runtime.withTenant = original;
    }
  });

  for (const terminalState of ["COMPLETED", "FAILED"] as const) {
    it(`serializes ${terminalState} catalog writes with operation ownership transfer`, async () => {
      const operation = await queueBackup();
      const claim = await worker.claimNext("terminal-owner");
      const written = deferred();
      const release = deferred();
      const original = runtime.withTenant.bind(runtime);
      let writerPid = 0;
      runtime.withTenant = async function <T>(
        tenantId: string,
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        settings?: Parameters<PrismaService["withTenant"]>[2]
      ): Promise<T> {
        return original(
          tenantId,
          tx =>
            callback(
              new Proxy(tx, {
                get(target, key) {
                  if (key !== "backupRecord") return Reflect.get(target, key);
                  return new Proxy(target.backupRecord, {
                    get(delegate, method) {
                      if (method !== "update")
                        return Reflect.get(delegate, method);
                      return async (args: Prisma.BackupRecordUpdateArgs) => {
                        const row = await delegate.update(args);
                        if (args.data.state === terminalState) {
                          const [backend] = await tx.$queryRawUnsafe<
                            { pid: number }[]
                          >("SELECT pg_backend_pid() AS pid");
                          writerPid = backend!.pid;
                          written.resolve();
                          await release.promise;
                        }
                        return row;
                      };
                    },
                  });
                },
              })
            ),
          settings
        );
      };
      const failureRoot = await mkdtemp(join(tmpdir(), "axes-terminal-fence-"));
      const failureStore = new FailOnceBackupStore({
        directory: failureRoot,
        key: randomBytes(32),
        maxBytes: options.maxBytes,
      });
      const targetService =
        terminalState === "FAILED"
          ? new BackupService(runtime, failureStore, options)
          : service;
      const work = targetService.create(
        organizationId,
        null,
        "SCHEDULED",
        operation.id,
        {
          workerId: "terminal-owner",
          attempts: claim!.attempts,
        }
      );
      const observed = work.then(
        () => undefined,
        () => undefined
      );
      let transfer: Promise<unknown> | undefined;
      try {
        await written.promise;
        transfer = owner.dataOperation
          .update({
            where: { id: operation.id },
            data: { leaseUntil: new Date(0) },
          })
          .then(row => row);
        const deadline = Date.now() + 2_000;
        let blocked = false;
        do {
          const rows = await owner.$queryRawUnsafe<{ pid: number }[]>(
            "SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1::int=ANY(pg_blocking_pids(pid)) AND query ILIKE '%data_operations%'",
            writerPid
          );
          blocked = rows.length > 0;
          if (blocked) break;
          await new Promise<void>(resolve => setImmediate(resolve));
        } while (Date.now() < deadline);
        expect(blocked).toBe(true);
      } finally {
        release.resolve();
        await observed;
        await transfer;
        runtime.withTenant = original;
        await rm(failureRoot, { recursive: true, force: true });
      }
    });
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

  for (const interruptedState of ["PENDING", "RUNNING"] as const) {
    it(`recovers an interrupted ${interruptedState} backup after the previous lease expires`, async () => {
      const operation = await queueBackup();
      const oldWorker = await worker.claimNext("worker-interrupted");
      expect(oldWorker?.id).toBe(operation.id);

      // Simulate a process crash after catalog persistence, without invoking
      // graceful catch/finally cleanup. No running worker remains.
      await runtime.withTenant(organizationId, async tx => {
        await tx.backupRecord.create({
          data: {
            id: operation.id,
            organizationId,
            actorUserId: null,
            reason: "SCHEDULED",
            state: interruptedState,
          },
        });
        await tx.dataOperation.update({
          where: { id: operation.id },
          data: { leaseUntil: new Date(0) },
        });
      });

      expect(await worker.processNext("worker-after-crash")).toBe(true);

      await runtime.withTenant(organizationId, async tx => {
        const backup = await tx.backupRecord.findUniqueOrThrow({
          where: { id_organizationId: { id: operation.id, organizationId } },
        });
        const recovered = await tx.dataOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        expect(backup.state).toBe("COMPLETED");
        expect(recovered.state).toBe("COMPLETED");
        expect(recovered.attempts).toBe(2);
        expect(await tx.backupRecord.count()).toBe(1);
      });
      await expect(store.read(operation.id)).resolves.toBeInstanceOf(Buffer);
    });
  }

  it("does not reclaim a backup owned by a worker with a live lease", async () => {
    const operation = await queueBackup();
    const current = await worker.claimNext("worker-live");
    expect(current?.id).toBe(operation.id);

    await runtime.withTenant(organizationId, tx =>
      tx.backupRecord.create({
        data: {
          id: operation.id,
          organizationId,
          actorUserId: null,
          reason: "SCHEDULED",
          state: "RUNNING",
        },
      })
    );

    await expect(
      service.create(organizationId, null, "SCHEDULED", operation.id)
    ).rejects.toThrow("BACKUP_IN_PROGRESS");
    expect(await worker.claimNext("worker-racing")).toBeNull();

    const currentOperation = await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.findUniqueOrThrow({ where: { id: operation.id } })
    );
    const catalog = await runtime.withTenant(organizationId, tx =>
      tx.backupRecord.findUniqueOrThrow({
        where: { id_organizationId: { id: operation.id, organizationId } },
      })
    );
    expect(currentOperation.workerId).toBe("worker-live");
    expect(currentOperation.attempts).toBe(1);
    expect(catalog.state).toBe("RUNNING");
  });

  it("rejects a worker whose lease expired before backup execution", async () => {
    const operation = await queueBackup();
    const claimed = await worker.claimNext("worker-expired");
    expect(claimed?.id).toBe(operation.id);

    await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.update({
        where: { id: operation.id },
        data: { leaseUntil: new Date(0) },
      })
    );

    await expect(
      service.create(organizationId, null, "SCHEDULED", operation.id, {
        workerId: "worker-expired",
        attempts: claimed!.attempts,
      })
    ).rejects.toThrow("BACKUP_IN_PROGRESS");

    const records = await runtime.withTenant(organizationId, tx =>
      tx.backupRecord.count({ where: { id: operation.id } })
    );
    expect(records).toBe(0);
  });

  it("rejects an obsolete worker attempt after a new worker claims the operation", async () => {
    const operation = await queueBackup();
    const former = await worker.claimNext("worker-former");
    expect(former?.id).toBe(operation.id);

    await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.update({
        where: { id: operation.id },
        data: { leaseUntil: new Date(0) },
      })
    );

    const successor = await worker.claimNext("worker-successor");
    expect(successor?.id).toBe(operation.id);
    expect(successor?.attempts).toBe(2);

    await expect(
      service.create(organizationId, null, "SCHEDULED", operation.id, {
        workerId: "worker-former",
        attempts: 1,
      })
    ).rejects.toThrow("BACKUP_IN_PROGRESS");

    expect(await worker.finish(former!)).toBe(false);
    expect(await worker.heartbeat(former!)).toBe(false);

    const live = await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.findUniqueOrThrow({ where: { id: operation.id } })
    );
    expect(live.state).toBe("RUNNING");
    expect(live.workerId).toBe("worker-successor");
    await expect(store.read(operation.id)).rejects.toThrow();
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

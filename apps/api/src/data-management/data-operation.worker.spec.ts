import type { BackupReason, BackupRecord } from "@axes/contracts";
import type { PrismaService } from "../database/prisma.service";
import type { DataOperation } from "../generated/prisma/client";
import type { BackupService } from "./backup.service";
import { BackupError } from "./backup-error";
import { DataOperationWorker } from "./data-operation.worker";

let jestRuntime: typeof jest;
beforeAll(async () => {
  // Jest supplies this ESM runtime helper without a direct API dependency.
  const globalsModule = "@jest/globals";
  jestRuntime = (await import(globalsModule)).jest;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("backup operation heartbeat lifecycle", () => {
  beforeEach(() => jestRuntime.useFakeTimers());
  afterEach(() => {
    jestRuntime.clearAllTimers();
    jestRuntime.useRealTimers();
    jestRuntime.restoreAllMocks();
  });

  function setup(beforeTransaction: () => Promise<void> = async () => {}) {
    const job = {
      id: "00000000-0000-0000-0000-000000000001",
      organizationId: "00000000-0000-0000-0000-000000000002",
      actorUserId: null,
      kind: "BACKUP",
      state: "RUNNING",
      workerId: "worker:test",
      attempts: 2,
      checkpoint: {},
      payload: { reason: "SCHEDULED" },
      stage: "PENDING",
      processed: 0,
      total: null,
      preventiveBackupId: null,
      errorCode: null,
      heartbeatAt: new Date(),
      leaseUntil: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    } as DataOperation;
    const backup = { id: job.id } as BackupRecord;
    const creation = deferred<BackupRecord>();
    const execute = jestRuntime
      .fn<Promise<number>, [query: string, ...parameters: unknown[]]>()
      .mockResolvedValue(1);
    const schedule = jestRuntime
      .fn<Promise<{ retentionCount: number } | null>, []>()
      .mockResolvedValue({ retentionCount: 7 });
    const audit = jestRuntime
      .fn<Promise<unknown>, [entry: unknown]>()
      .mockResolvedValue({});
    const transaction = {
      $executeRawUnsafe: execute,
      backupSchedule: { findUnique: schedule },
      auditLog: { create: audit },
    };
    const database = {
      async withTenant<T>(
        _organizationId: string,
        callback: (tx: typeof transaction) => Promise<T>
      ): Promise<T> {
        await beforeTransaction();
        return callback(transaction);
      },
    };
    const service = {
      create: jestRuntime
        .fn<
          Promise<BackupRecord>,
          [
            organizationId: string,
            actorId: string | null,
            reason: BackupReason,
            requestedId?: string,
            fence?: {
              workerId: string;
              attempts: number;
              signal?: AbortSignal;
            },
          ]
        >()
        .mockImplementation(() => creation.promise),
      verify: jestRuntime.fn<Promise<unknown>, []>().mockResolvedValue({}),
      pruneRetention: jestRuntime
        .fn<
          Promise<number>,
          [organizationId: string, count: number, signal?: AbortSignal]
        >()
        .mockResolvedValue(0),
    };
    const worker = new DataOperationWorker(
      database as unknown as PrismaService,
      service as unknown as BackupService
    );
    jestRuntime.spyOn(worker, "claimNext").mockResolvedValue(job);
    const heartbeat = jestRuntime
      .spyOn(worker, "heartbeat")
      .mockResolvedValue(true);
    const finish = jestRuntime.spyOn(worker, "finish").mockResolvedValue(true);
    const signal = () => service.create.mock.calls[0]![4]?.signal;
    return {
      job,
      backup,
      creation,
      execute,
      audit,
      schedule,
      service,
      worker,
      heartbeat,
      finish,
      signal,
    };
  }

  it("renews throughout slow backup creation and stops renewals after success", async () => {
    const test = setup();
    const processing = test.worker.processNext(test.job.workerId!);
    await jestRuntime.advanceTimersByTimeAsync(45_000);

    expect(test.heartbeat).toHaveBeenCalledTimes(3);
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.signal()).toBeInstanceOf(AbortSignal);
    expect(test.signal()?.aborted).toBe(false);

    test.creation.resolve(test.backup);
    await expect(processing).resolves.toBe(true);
    expect(jestRuntime.getTimerCount()).toBe(0);
    await jestRuntime.advanceTimersByTimeAsync(60_000);
    expect(test.heartbeat).toHaveBeenCalledTimes(3);
  });

  it.each(["rejected", "unowned"] as const)(
    "aborts a slow backup when renewal is %s before any further side effects",
    async renewalResult => {
      const test = setup();
      if (renewalResult === "rejected") {
        test.heartbeat.mockRejectedValue(new Error("database unavailable"));
      } else {
        test.heartbeat.mockResolvedValue(false);
      }
      const processing = test.worker.processNext(test.job.workerId!);
      await jestRuntime.advanceTimersByTimeAsync(15_000);

      expect(test.signal()?.aborted).toBe(true);
      await jestRuntime.advanceTimersByTimeAsync(60_000);
      expect(test.heartbeat).toHaveBeenCalledTimes(1);
      test.creation.resolve(test.backup);

      await expect(processing).resolves.toBe(false);
      expect(test.execute).not.toHaveBeenCalled();
      expect(test.schedule).not.toHaveBeenCalled();
      expect(test.service.pruneRetention).not.toHaveBeenCalled();
      expect(test.finish).not.toHaveBeenCalled();
      expect(jestRuntime.getTimerCount()).toBe(0);
    }
  );

  it("drains an in-flight renewal before checkpointing a completed backup", async () => {
    const test = setup();
    const renewal = deferred<boolean>();
    test.heartbeat.mockImplementation(() => renewal.promise);
    let settled = false;
    const processing = test.worker
      .processNext(test.job.workerId!)
      .finally(() => {
        settled = true;
      });
    await jestRuntime.advanceTimersByTimeAsync(15_000);
    test.creation.resolve(test.backup);
    await jestRuntime.advanceTimersByTimeAsync(0);

    expect(settled).toBe(false);
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.service.pruneRetention).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();

    renewal.resolve(true);
    await expect(processing).resolves.toBe(true);
    expect(test.execute).toHaveBeenCalledTimes(1);
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("does not checkpoint if renewal fails while waiting for a tenant transaction", async () => {
    const checkpointReady = deferred<void>();
    const test = setup(() => checkpointReady.promise);
    test.creation.resolve(test.backup);
    test.heartbeat.mockResolvedValue(false);
    const processing = test.worker.processNext(test.job.workerId!);
    await jestRuntime.advanceTimersByTimeAsync(15_000);

    expect(test.signal()?.aborted).toBe(true);
    checkpointReady.resolve();
    await expect(processing).resolves.toBe(false);
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.service.pruneRetention).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("drains renewal after an error before returning and leaves no background work", async () => {
    const test = setup();
    const renewal = deferred<boolean>();
    test.heartbeat.mockImplementation(() => renewal.promise);
    let settled = false;
    const processing = test.worker.processNext(test.job.workerId!).then(
      value => ({ value, error: undefined }),
      (error: Error) => ({ value: undefined, error })
    );
    void processing.then(() => {
      settled = true;
    });
    await jestRuntime.advanceTimersByTimeAsync(15_000);
    const failure = new Error("snapshot failed");
    test.creation.reject(failure);
    await jestRuntime.advanceTimersByTimeAsync(0);

    expect(settled).toBe(false);
    expect(jestRuntime.getTimerCount()).toBe(0);
    renewal.resolve(true);
    expect((await processing).error).toBe(failure);
    await jestRuntime.advanceTimersByTimeAsync(60_000);
    expect(test.heartbeat).toHaveBeenCalledTimes(1);
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("prevents retention and completion when a resumed backup loses renewal", async () => {
    const test = setup();
    test.job.checkpoint = { businessCommitted: true, backupId: test.job.id };
    const verification = deferred<unknown>();
    test.service.verify.mockImplementation(() => verification.promise);
    const renewal = deferred<boolean>();
    test.heartbeat.mockImplementation(() => renewal.promise);
    const processing = test.worker.processNext(test.job.workerId!);
    await jestRuntime.advanceTimersByTimeAsync(15_000);
    verification.resolve({});
    await jestRuntime.advanceTimersByTimeAsync(0);

    expect(test.service.pruneRetention).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    renewal.resolve(false);
    await expect(processing).resolves.toBe(false);
    expect(test.service.pruneRetention).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("shares cancellation with retention and stops completion after renewal fails", async () => {
    const test = setup();
    const retention = deferred<number>();
    test.service.pruneRetention.mockImplementation(() => retention.promise);
    test.heartbeat.mockResolvedValue(false);
    test.creation.resolve(test.backup);
    const processing = test.worker.processNext(test.job.workerId!);
    await jestRuntime.advanceTimersByTimeAsync(0);

    expect(test.service.pruneRetention).toHaveBeenCalledWith(
      test.job.organizationId,
      7,
      test.signal()
    );
    await jestRuntime.advanceTimersByTimeAsync(15_000);
    expect(test.signal()?.aborted).toBe(true);
    retention.resolve(0);
    await expect(processing).resolves.toBe(false);
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("does not complete a backup when the fenced checkpoint rejects its claim", async () => {
    const test = setup();
    test.execute.mockResolvedValue(0);
    test.creation.resolve(test.backup);

    await expect(test.worker.processNext(test.job.workerId!)).resolves.toBe(
      false
    );
    expect(test.service.pruneRetention).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it.each([
    "BACKUP_INVALID",
    "BACKUP_SCHEMA_UNSUPPORTED",
    "BACKUP_VERSION_UNSUPPORTED",
    "BACKUP_ORGANIZATION_MISMATCH",
    "BACKUP_REFERENCES_INVALID",
    "BACKUP_TOO_LARGE",
    "BACKUP_ATTACHMENT_ADAPTER_REQUIRED",
  ])("terminalizes and audits an owned operation after %s", async errorCode => {
    const test = setup();
    test.service.create.mockRejectedValue(new BackupError(errorCode));

    await expect(test.worker.processNext(test.job.workerId!)).resolves.toBe(
      false
    );
    expect(test.execute).toHaveBeenCalledTimes(1);
    const [sql, ...parameters] = test.execute.mock.calls[0]!;
    expect(sql).toContain("state='FAILED'");
    expect(sql).toContain("stage='FAILED'");
    expect(sql).toContain("error_code=$5");
    expect(sql).toContain("completed_at=clock_timestamp()");
    expect(sql).toContain("lease_until=NULL");
    expect(sql).toContain(
      "WHERE id=$1::uuid AND organization_id=$2::uuid AND state='RUNNING'"
    );
    expect(sql).toContain(
      "AND worker_id=$3 AND attempts=$4 AND lease_until > clock_timestamp()"
    );
    expect(parameters).toEqual([
      test.job.id,
      test.job.organizationId,
      test.job.workerId,
      test.job.attempts,
      errorCode,
    ]);
    expect(test.audit).toHaveBeenCalledTimes(1);
    expect(test.audit).toHaveBeenCalledWith({
      data: {
        organizationId: test.job.organizationId,
        actorUserId: test.job.actorUserId,
        requestId: test.job.id,
        action: "data_operation.failed",
        entityType: "data_operation",
        entityId: test.job.id,
        metadata: { errorCode, attempts: test.job.attempts },
      },
    });
    expect(test.service.pruneRetention).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it.each([
    "BACKUP_FAILED",
    "BACKUP_IN_PROGRESS",
    "BACKUP_FORBIDDEN",
    "BACKUP_NOT_CONFIGURED",
    "BACKUP_INVALID_DETAIL",
  ])("preserves retry behavior for %s", async errorCode => {
    const test = setup();
    const failure = new BackupError(errorCode);
    test.service.create.mockRejectedValue(failure);

    await expect(test.worker.processNext(test.job.workerId!)).rejects.toBe(
      failure
    );
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.audit).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("does not terminalize an untyped error with a deterministic-looking message", async () => {
    const test = setup();
    const failure = new Error("BACKUP_INVALID");
    test.service.create.mockRejectedValue(failure);

    await expect(test.worker.processNext(test.job.workerId!)).rejects.toBe(
      failure
    );
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.audit).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("does not audit a terminal failure when the operation fence rejects the update", async () => {
    const test = setup();
    test.execute.mockResolvedValue(0);
    test.service.create.mockRejectedValue(new BackupError("BACKUP_INVALID"));

    await expect(test.worker.processNext(test.job.workerId!)).resolves.toBe(
      false
    );
    expect(test.execute).toHaveBeenCalledTimes(1);
    expect(test.audit).not.toHaveBeenCalled();
    expect(test.finish).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it("cancels terminalization if the signal aborts during tenant transaction setup", async () => {
    const lease = new AbortController();
    jestRuntime
      .spyOn(globalThis, "AbortController")
      .mockImplementation(() => lease);
    const test = setup(async () => lease.abort());
    test.service.create.mockRejectedValue(new BackupError("BACKUP_INVALID"));

    await expect(test.worker.processNext(test.job.workerId!)).resolves.toBe(
      false
    );
    expect(test.signal()?.aborted).toBe(true);
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.audit).not.toHaveBeenCalled();
    expect(jestRuntime.getTimerCount()).toBe(0);
  });

  it.each(["rejected", "unowned"] as const)(
    "drains a %s in-flight heartbeat before deciding whether to terminalize",
    async renewalResult => {
      const test = setup();
      const renewal = deferred<boolean>();
      test.heartbeat.mockImplementation(() => renewal.promise);
      const processing = test.worker.processNext(test.job.workerId!).then(
        value => ({ value, error: undefined }),
        (error: Error) => ({ value: undefined, error })
      );
      await jestRuntime.advanceTimersByTimeAsync(15_000);
      test.creation.reject(new BackupError("BACKUP_INVALID"));
      await jestRuntime.advanceTimersByTimeAsync(0);

      expect(test.execute).not.toHaveBeenCalled();
      expect(jestRuntime.getTimerCount()).toBe(0);
      if (renewalResult === "rejected") {
        renewal.reject(new Error("database unavailable"));
      } else {
        renewal.resolve(false);
      }
      expect(await processing).toEqual({ value: false, error: undefined });
      expect(test.signal()?.aborted).toBe(true);
      expect(test.execute).not.toHaveBeenCalled();
      expect(test.audit).not.toHaveBeenCalled();
      expect(test.finish).not.toHaveBeenCalled();
    }
  );
});

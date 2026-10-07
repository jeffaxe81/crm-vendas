import { BackupWorkerRunner } from "./backup-worker.runner";

describe("backup worker runner", () => {
  it("enqueues due schedules and drains available operations sequentially", async () => {
    let scheduleCalls = 0;
    let processCalls = 0;
    const schedule = {
      async enqueueDue() {
        scheduleCalls += 1;
        return 2;
      },
    };
    const outcomes = [true, true, false];
    const worker = {
      async processNext(workerId: string) {
        expect(workerId).toBe("backup-worker:test");
        const result = outcomes[processCalls];
        processCalls += 1;
        return result ?? false;
      },
    };

    const runner = new BackupWorkerRunner(
      schedule,
      worker,
      "backup-worker:test"
    );

    await expect(
      runner.runCycle(new Date("2026-10-06T09:00:00Z"))
    ).resolves.toEqual({
      enqueued: 2,
      processed: 2,
    });

    expect(scheduleCalls).toBe(1);
    expect(processCalls).toBe(3);
  });

  it("does not overlap cycles while a previous poll is still running", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    let scheduleCalls = 0;
    const schedule = {
      async enqueueDue() {
        scheduleCalls += 1;
        await blocked;
        return 0;
      },
    };
    const worker = {
      async processNext() {
        return false;
      },
    };

    const runner = new BackupWorkerRunner(
      schedule,
      worker,
      "backup-worker:test"
    );

    const first = runner.runCycle();
    await Promise.resolve();

    await expect(runner.runCycle()).resolves.toBeNull();
    expect(scheduleCalls).toBe(1);

    release();
    await expect(first).resolves.toEqual({ enqueued: 0, processed: 0 });
  });
});

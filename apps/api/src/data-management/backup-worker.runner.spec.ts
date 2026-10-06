import { BackupWorkerRunner } from "./backup-worker.runner";

describe("backup worker runner", () => {
  it("enqueues due schedules and drains available operations sequentially", async () => {
    const schedule = {
      enqueueDue: jest.fn().mockResolvedValue(2),
    };
    const worker = {
      processNext: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
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

    expect(schedule.enqueueDue).toHaveBeenCalledTimes(1);
    expect(worker.processNext).toHaveBeenCalledTimes(3);
    expect(worker.processNext).toHaveBeenCalledWith("backup-worker:test");
  });

  it("does not overlap cycles while a previous poll is still running", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    const schedule = {
      enqueueDue: jest.fn().mockImplementation(async () => {
        await blocked;
        return 0;
      }),
    };
    const worker = {
      processNext: jest.fn().mockResolvedValue(false),
    };

    const runner = new BackupWorkerRunner(
      schedule,
      worker,
      "backup-worker:test"
    );

    const first = runner.runCycle();
    await Promise.resolve();

    await expect(runner.runCycle()).resolves.toBeNull();
    expect(schedule.enqueueDue).toHaveBeenCalledTimes(1);

    release();
    await expect(first).resolves.toEqual({ enqueued: 0, processed: 0 });
  });
});

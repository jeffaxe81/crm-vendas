import { jest } from "@jest/globals";

import { BackupWorkerRuntime } from "./backup-worker.runtime";

describe("backup worker runtime", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("stays idle when backup storage is not configured", async () => {
    jest.useFakeTimers();
    const runner = {
      runCycle: jest.fn().mockResolvedValue({ enqueued: 0, processed: 0 }),
    };
    const runtime = new BackupWorkerRuntime(runner, {
      enabled: false,
      pollMs: 1_000,
    });

    runtime.onModuleInit();
    await Promise.resolve();
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();

    expect(runner.runCycle).not.toHaveBeenCalled();
    await runtime.onModuleDestroy();
  });

  it("runs immediately, prevents overlapping polls and waits for shutdown", async () => {
    jest.useFakeTimers();

    let releaseFirst!: () => void;
    const firstCycle = new Promise(resolve => {
      releaseFirst = () => resolve({ enqueued: 1, processed: 1 });
    });
    const runner = {
      runCycle: jest
        .fn()
        .mockImplementationOnce(() => firstCycle)
        .mockResolvedValue({ enqueued: 0, processed: 0 }),
    };
    const runtime = new BackupWorkerRuntime(runner, {
      enabled: true,
      pollMs: 1_000,
    });

    runtime.onModuleInit();
    await Promise.resolve();

    expect(runner.runCycle).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3_000);
    await Promise.resolve();
    expect(runner.runCycle).toHaveBeenCalledTimes(1);

    let shutdownFinished = false;
    const shutdown = runtime.onModuleDestroy().then(() => {
      shutdownFinished = true;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    releaseFirst();
    await firstCycle;
    await shutdown;
    expect(shutdownFinished).toBe(true);

    jest.advanceTimersByTime(3_000);
    await Promise.resolve();
    expect(runner.runCycle).toHaveBeenCalledTimes(1);
  });

  it("continues polling after a failed cycle", async () => {
    jest.useFakeTimers();
    const runner = {
      runCycle: jest
        .fn()
        .mockRejectedValueOnce(new Error("synthetic cycle failure"))
        .mockResolvedValue({ enqueued: 0, processed: 0 }),
    };
    const runtime = new BackupWorkerRuntime(runner, {
      enabled: true,
      pollMs: 1_000,
    });

    runtime.onModuleInit();
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(runner.runCycle).toHaveBeenCalledTimes(2);
    await runtime.onModuleDestroy();
  });
});

import { BackupWorkerRuntime } from "./backup-worker.runtime";

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for backup worker runtime condition.");
    }
    await delay(5);
  }
}

describe("backup worker runtime", () => {
  it("stays idle when backup storage is not configured", async () => {
    let calls = 0;
    const runner = {
      async runCycle() {
        calls += 1;
        return { enqueued: 0, processed: 0 };
      },
    };
    const runtime = new BackupWorkerRuntime(runner, {
      enabled: false,
      pollMs: 5,
    });

    runtime.onModuleInit();
    await delay(25);

    expect(calls).toBe(0);
    await runtime.onModuleDestroy();
  });

  it("runs immediately, prevents overlapping polls and waits for shutdown", async () => {
    let calls = 0;
    let releaseFirst!: () => void;
    const firstCycle = new Promise<{ enqueued: number; processed: number }>(
      resolve => {
        releaseFirst = () => resolve({ enqueued: 1, processed: 1 });
      }
    );
    const runner = {
      async runCycle() {
        calls += 1;
        if (calls === 1) return firstCycle;
        return { enqueued: 0, processed: 0 };
      },
    };
    const runtime = new BackupWorkerRuntime(runner, {
      enabled: true,
      pollMs: 5,
    });

    runtime.onModuleInit();
    await waitFor(() => calls === 1);
    await delay(25);
    expect(calls).toBe(1);

    let shutdownFinished = false;
    const shutdown = runtime.onModuleDestroy().then(() => {
      shutdownFinished = true;
    });
    await delay(10);
    expect(shutdownFinished).toBe(false);

    releaseFirst();
    await shutdown;
    expect(shutdownFinished).toBe(true);

    await delay(20);
    expect(calls).toBe(1);
  });

  it("continues polling after a failed cycle", async () => {
    let calls = 0;
    const runner = {
      async runCycle() {
        calls += 1;
        if (calls === 1) throw new Error("synthetic cycle failure");
        return { enqueued: 0, processed: 0 };
      },
    };
    const runtime = new BackupWorkerRuntime(runner, {
      enabled: true,
      pollMs: 5,
    });

    runtime.onModuleInit();
    await waitFor(() => calls >= 2);
    await runtime.onModuleDestroy();

    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

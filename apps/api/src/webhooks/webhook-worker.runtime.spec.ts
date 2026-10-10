import { WebhookWorkerRuntime } from "./webhook-worker.runtime";
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
describe("webhook worker runtime", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.WEBHOOK_WORKER_ENABLED = "true";
    process.env.WEBHOOK_WORKER_POLL_MS = "5";
    process.env.WEBHOOK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  });
  afterEach(() => {
    for (const name of [
      "NODE_ENV",
      "WEBHOOK_WORKER_ENABLED",
      "WEBHOOK_WORKER_POLL_MS",
      "WEBHOOK_ENCRYPTION_KEY",
    ]) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  it.each(["test", "disabled", "missing", "invalid"])(
    "stays idle for %s configuration",
    async mode => {
      if (mode === "test") process.env.NODE_ENV = "test";
      if (mode === "disabled") process.env.WEBHOOK_WORKER_ENABLED = "false";
      if (mode === "missing") delete process.env.WEBHOOK_ENCRYPTION_KEY;
      if (mode === "invalid") process.env.WEBHOOK_ENCRYPTION_KEY = "broken";
      let calls = 0;
      const runtime = new WebhookWorkerRuntime({
        runCycle: async () => {
          calls++;
        },
      });
      runtime.onModuleInit();
      await delay(15);
      await runtime.onModuleDestroy();
      expect(calls).toBe(0);
    }
  );
  it("starts immediately, suppresses overlapping polls and drains shutdown", async () => {
    let calls = 0,
      release!: () => void;
    const blocked = new Promise<void>(r => (release = r));
    const runtime = new WebhookWorkerRuntime({
      runCycle: async () => {
        calls++;
        await blocked;
      },
    });
    runtime.onModuleInit();
    await delay(20);
    expect(calls).toBe(1);
    let stopped = false;
    const shutdown = runtime.onModuleDestroy().then(() => {
      stopped = true;
    });
    await delay(10);
    expect(stopped).toBe(false);
    release();
    await shutdown;
    await delay(15);
    expect(calls).toBe(1);
  });
});

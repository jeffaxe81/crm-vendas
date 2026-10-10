import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { webhookEncryptionKey } from "./webhook-secret";
import type { WebhookWorker } from "./webhook-worker";
export class WebhookWorkerRuntime implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;
  private readonly logger = new Logger(WebhookWorkerRuntime.name);
  constructor(private readonly worker: Pick<WebhookWorker, "runCycle">) {}
  onModuleInit(): void {
    if (
      this.timer ||
      process.env.NODE_ENV === "test" ||
      process.env.WEBHOOK_WORKER_ENABLED !== "true"
    )
      return;
    try {
      webhookEncryptionKey(process.env.WEBHOOK_ENCRYPTION_KEY);
    } catch {
      return;
    }
    const pollMs = Number(process.env.WEBHOOK_WORKER_POLL_MS ?? 5000);
    if (!Number.isInteger(pollMs) || pollMs <= 0) return;
    this.stopped = false;
    this.trigger();
    this.timer = setInterval(() => this.trigger(), pollMs);
    this.timer.unref?.();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
  }
  private trigger(): void {
    if (this.stopped || this.inFlight) return;
    const cycle = Promise.resolve()
      .then(() => this.worker.runCycle())
      .catch(() => {
        this.logger.error("Webhook worker cycle failed");
      });
    this.inFlight = cycle;
    void cycle.finally(() => {
      if (this.inFlight === cycle) this.inFlight = null;
    });
  }
}

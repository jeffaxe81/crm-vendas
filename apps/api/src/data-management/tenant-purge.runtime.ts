import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import type { TenantPurgeService } from "./tenant-purge.service";

/** Separate from backup storage: no backup encryption key required to poll. */
export class TenantPurgeRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantPurgeRuntime.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;

  constructor(private readonly service: Pick<TenantPurgeService, "runDue">) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || this.timer) return;
    this.stopped = false;
    this.trigger();
    this.timer = setInterval(() => this.trigger(), 60 * 60 * 1000);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  private trigger(): void {
    if (this.stopped || this.inFlight) return;
    const cycle = Promise.resolve()
      .then(() => this.service.runDue())
      .catch(() => {
        this.logger.error("Tenant purge cycle failed");
      })
      .then(() => undefined);
    this.inFlight = cycle;
    void cycle.finally(() => {
      if (this.inFlight === cycle) this.inFlight = null;
    });
  }
}

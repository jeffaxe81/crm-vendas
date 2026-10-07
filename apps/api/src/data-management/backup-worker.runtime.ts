import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import type { BackupWorkerRunner } from "./backup-worker.runner";

type CycleRunner = Pick<BackupWorkerRunner, "runCycle">;

export type BackupWorkerRuntimeOptions = {
  enabled: boolean;
  pollMs: number;
};

export class BackupWorkerRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupWorkerRuntime.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly runner: CycleRunner,
    private readonly options: BackupWorkerRuntimeOptions
  ) {}

  onModuleInit(): void {
    if (!this.options.enabled || this.timer) return;

    this.stopped = false;
    this.triggerCycle();
    this.timer = setInterval(() => this.triggerCycle(), this.options.pollMs);
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

  private triggerCycle(): void {
    if (this.stopped || this.inFlight) return;

    const cycle = Promise.resolve()
      .then(() => this.runner.runCycle())
      .catch(error => {
        this.logger.error(
          "Backup worker cycle failed",
          error instanceof Error ? error.stack : undefined
        );
      })
      .then(() => undefined);

    this.inFlight = cycle;
    void cycle.finally(() => {
      if (this.inFlight === cycle) this.inFlight = null;
    });
  }
}

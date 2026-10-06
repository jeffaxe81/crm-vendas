import type { BackupScheduleService } from "./backup-schedule.service";
import type { DataOperationWorker } from "./data-operation.worker";

type ScheduleRunner = Pick<BackupScheduleService, "enqueueDue">;
type OperationRunner = Pick<DataOperationWorker, "processNext">;

export type BackupWorkerCycleResult = {
  enqueued: number;
  processed: number;
};

export class BackupWorkerRunner {
  private running = false;

  constructor(
    private readonly schedule: ScheduleRunner,
    private readonly worker: OperationRunner,
    private readonly workerId: string
  ) {}

  async runCycle(
    now: Date = new Date()
  ): Promise<BackupWorkerCycleResult | null> {
    if (this.running) return null;

    this.running = true;
    try {
      const enqueued = await this.schedule.enqueueDue(now);
      let processed = 0;

      while (await this.worker.processNext(this.workerId)) {
        processed += 1;
      }

      return { enqueued, processed };
    } finally {
      this.running = false;
    }
  }
}

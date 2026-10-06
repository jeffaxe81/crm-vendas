import type { BackupScheduleService } from "./backup-schedule.service";
import type { DataOperationWorker } from "./data-operation.worker";

type ScheduleRunner = Pick<BackupScheduleService, "enqueueDue">;
type OperationRunner = Pick<DataOperationWorker, "processNext">;

export type BackupWorkerCycleResult = {
  enqueued: number;
  processed: number;
};

export class BackupWorkerRunner {
  constructor(
    private readonly schedule: ScheduleRunner,
    private readonly worker: OperationRunner,
    private readonly workerId: string
  ) {}

  async runCycle(_now: Date = new Date()): Promise<BackupWorkerCycleResult | null> {
    void this.schedule;
    void this.worker;
    void this.workerId;
    throw new Error("NOT_IMPLEMENTED");
  }
}

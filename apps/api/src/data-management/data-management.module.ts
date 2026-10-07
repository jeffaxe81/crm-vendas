import { Module } from "@nestjs/common";
import { hostname } from "node:os";

import { parseApiEnvironment } from "../config/environment";
import { DatabaseModule } from "../database/database.module";
import { BackupScheduleService } from "./backup-schedule.service";
import { BackupStore } from "./backup-store";
import { BackupWorkerRunner } from "./backup-worker.runner";
import { BackupWorkerRuntime } from "./backup-worker.runtime";
import { BACKUP_OPTIONS, BACKUP_STORE, BackupService } from "./backup.service";
import { DataOperationWorker } from "./data-operation.worker";
import { DataPreviewService } from "./data-preview.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: BACKUP_OPTIONS,
      useFactory: () => {
        const env = parseApiEnvironment(process.env);
        return {
          maxBytes: env.BACKUP_MAX_BYTES,
          snapshotTimeoutMs: env.BACKUP_SNAPSHOT_TIMEOUT_MS,
        };
      },
    },
    {
      provide: BACKUP_STORE,
      useFactory: () => {
        const env = parseApiEnvironment(process.env);
        return env.BACKUP_DIRECTORY && env.BACKUP_ENCRYPTION_KEY
          ? new BackupStore({
              directory: env.BACKUP_DIRECTORY,
              key: Buffer.from(env.BACKUP_ENCRYPTION_KEY, "base64"),
              maxBytes: env.BACKUP_MAX_BYTES,
            })
          : null;
      },
    },
    BackupService,
    BackupScheduleService,
    DataPreviewService,
    DataOperationWorker,
    {
      provide: BackupWorkerRunner,
      inject: [BackupScheduleService, DataOperationWorker],
      useFactory: (
        schedule: BackupScheduleService,
        worker: DataOperationWorker
      ) =>
        new BackupWorkerRunner(
          schedule,
          worker,
          `backup-worker:${hostname()}:${process.pid}`
        ),
    },
    {
      provide: BackupWorkerRuntime,
      inject: [BackupWorkerRunner],
      useFactory: (runner: BackupWorkerRunner) => {
        const env = parseApiEnvironment(process.env);
        return new BackupWorkerRuntime(runner, {
          enabled: Boolean(env.BACKUP_DIRECTORY && env.BACKUP_ENCRYPTION_KEY),
          pollMs: env.BACKUP_WORKER_POLL_MS,
        });
      },
    },
  ],
  exports: [BackupService, DataPreviewService, BACKUP_STORE, BACKUP_OPTIONS],
})
export class DataManagementModule {}

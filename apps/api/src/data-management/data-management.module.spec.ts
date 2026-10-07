import { MODULE_METADATA } from "@nestjs/common/constants";

import { BackupScheduleService } from "./backup-schedule.service";
import { BackupWorkerRunner } from "./backup-worker.runner";
import { BackupWorkerRuntime } from "./backup-worker.runtime";
import { DataManagementModule } from "./data-management.module";
import { DataOperationWorker } from "./data-operation.worker";
import { DataPreviewService } from "./data-preview.service";

describe("data management backup worker wiring", () => {
  it("registers the schedule, durable worker, runner and runtime in Nest", () => {
    const providers =
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DataManagementModule) as
        | Array<
            | Function
            | {
                provide?: unknown;
              }
          >
        | undefined) ?? [];

    expect(providers).toContain(BackupScheduleService);
    expect(providers).toContain(DataOperationWorker);
    expect(providers).toContain(DataPreviewService);
    expect(
      providers.some(
        provider =>
          typeof provider === "object" &&
          provider !== null &&
          provider.provide === BackupWorkerRunner
      )
    ).toBe(true);
    expect(
      providers.some(
        provider =>
          typeof provider === "object" &&
          provider !== null &&
          provider.provide === BackupWorkerRuntime
      )
    ).toBe(true);
  });
});

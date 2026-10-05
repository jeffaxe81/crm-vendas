import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { parseApiEnvironment } from "../config/environment";
import { BackupStore } from "./backup-store";
import { BACKUP_OPTIONS, BACKUP_STORE, BackupService } from "./backup.service";
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
  ],
  exports: [BackupService, BACKUP_STORE, BACKUP_OPTIONS],
})
export class DataManagementModule {}

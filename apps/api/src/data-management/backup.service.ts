import type {
  BackupRecord,
  BackupReason,
  BackupManifest,
} from "@axes/contracts";
import type { PrismaService } from "../database/prisma.service";
import type { BackupStore } from "./backup-store";
import type { SnapshotData } from "./backup-manifest";
import { BackupError } from "./backup-error";
export type BackupOptions = { maxBytes: number; snapshotTimeoutMs: number };
export type VerifiedBackup = {
  bytes: Buffer;
  data: SnapshotData;
  manifest: BackupManifest;
  record: BackupRecord;
};
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: BackupStore | null,
    private readonly options: BackupOptions
  ) {}
  async create(
    _organizationId: string,
    _actorId: string | null,
    _reason: BackupReason
  ): Promise<BackupRecord> {
    if (!this.store) throw new BackupError("BACKUP_NOT_CONFIGURED");
    throw Error("NOT_IMPLEMENTED");
  }
  async verify(
    _organizationId: string,
    _backupId: string
  ): Promise<VerifiedBackup> {
    throw Error("NOT_IMPLEMENTED");
  }
}

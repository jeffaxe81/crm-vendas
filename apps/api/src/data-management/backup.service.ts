import type {
  BackupRecord,
  BackupReason,
  BackupManifest,
} from "@axes/contracts";
import type { PrismaService } from "../database/prisma.service";
import type { BackupStore } from "./backup-store";
import type { SnapshotData } from "./backup-manifest";
export type BackupOptions = { maxBytes: number; snapshotTimeoutMs: number };
export type VerifiedBackup = {
  bytes: Buffer;
  data: SnapshotData;
  manifest: BackupManifest;
  record: BackupRecord;
};
export class BackupService {
  constructor(
    _prisma: PrismaService,
    _store: BackupStore | null,
    _options: BackupOptions
  ) {}
  async create(
    _organizationId: string,
    _actorId: string | null,
    _reason: BackupReason
  ): Promise<BackupRecord> {
    throw Error("NOT_IMPLEMENTED");
  }
  async verify(
    _organizationId: string,
    _backupId: string
  ): Promise<VerifiedBackup> {
    throw Error("NOT_IMPLEMENTED");
  }
}

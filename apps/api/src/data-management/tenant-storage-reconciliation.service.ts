import { Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import {
  BackupStore,
  BACKUP_ENVELOPE_OVERHEAD_BYTES,
} from "./backup-store";
import { BACKUP_STORE } from "./backup.service";

const MAX_OBJECTS_PER_SCAN = 50;

type Finding = {
  backupId: string;
  status: "MISSING" | "SIZE_MISMATCH" | "UNREADABLE";
  catalogBytes: string;
  filesystemBytes: string | null;
};

export type StorageReconciliationResult = {
  configured: boolean;
  scope: "COMPLETED_TENANT_BACKUPS";
  metadataOnly: true;
  scanLimit: number;
  catalogCount: number;
  checkedCount: number;
  complete: boolean;
  matchingCount: number;
  missingCount: number;
  sizeMismatchCount: number;
  unreadableCount: number;
  scannedFilesystemBytes: string;
  findings: Finding[];
};

/**
 * Bounded, read-only metadata comparison against tenant-scoped catalog rows.
 * Never enumerates the shared backup directory, reads encrypted payloads,
 * reports filesystem paths or makes destructive changes.
 */
@Injectable()
export class TenantStorageReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BACKUP_STORE) private readonly store: BackupStore | null
  ) {}

  async scan(
    principal: AuthenticatedPrincipal
  ): Promise<StorageReconciliationResult> {
    const { catalogCount, backups } = await this.prisma.withTenant(
      principal.organizationId,
      async tx => {
        const where = {
          organizationId: principal.organizationId,
          state: "COMPLETED",
        };
        const [catalogCount, backups] = await Promise.all([
          tx.backupRecord.count({ where }),
          tx.backupRecord.findMany({
            where,
            orderBy: [{ completedAt: "desc" }, { id: "desc" }],
            take: MAX_OBJECTS_PER_SCAN,
            select: { id: true, byteCount: true },
          }),
        ]);
        return { catalogCount, backups };
      }
    );
    const report: StorageReconciliationResult = {
      configured: this.store !== null,
      scope: "COMPLETED_TENANT_BACKUPS",
      metadataOnly: true,
      scanLimit: MAX_OBJECTS_PER_SCAN,
      catalogCount,
      checkedCount: 0,
      complete: catalogCount === 0,
      matchingCount: 0,
      missingCount: 0,
      sizeMismatchCount: 0,
      unreadableCount: 0,
      scannedFilesystemBytes: "0",
      findings: [],
    };
    if (!this.store) return report;

    let total = 0n;
    for (const backup of backups) {
      report.checkedCount++;
      let filesystemBytes: number | null;
      try {
        filesystemBytes = await this.store.objectSize(backup.id);
      } catch {
        report.unreadableCount++;
        report.findings.push({
          backupId: backup.id,
          status: "UNREADABLE",
          catalogBytes: backup.byteCount?.toString() ?? "0",
          filesystemBytes: null,
        });
        continue;
      }
      if (filesystemBytes === null) {
        report.missingCount++;
        report.findings.push({
          backupId: backup.id,
          status: "MISSING",
          catalogBytes: backup.byteCount?.toString() ?? "0",
          filesystemBytes: null,
        });
        continue;
      }
      total += BigInt(filesystemBytes);
      const expected =
        backup.byteCount === null
          ? null
          : backup.byteCount + BigInt(BACKUP_ENVELOPE_OVERHEAD_BYTES);
      if (expected !== null && BigInt(filesystemBytes) === expected) {
        report.matchingCount++;
      } else {
        report.sizeMismatchCount++;
        report.findings.push({
          backupId: backup.id,
          status: "SIZE_MISMATCH",
          catalogBytes: backup.byteCount?.toString() ?? "0",
          filesystemBytes: filesystemBytes.toString(),
        });
      }
    }
    report.scannedFilesystemBytes = total.toString();
    report.complete = catalogCount === report.checkedCount;
    return report;
  }
}

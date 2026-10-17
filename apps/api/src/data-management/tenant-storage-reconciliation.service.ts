import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { BackupStore, BACKUP_ENVELOPE_OVERHEAD_BYTES } from "./backup-store";
import { BACKUP_STORE } from "./backup.service";

const MAX_OBJECTS_PER_SCAN = 50;
const CURSOR_UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

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
  nextCursor: string | null;
  matchingCount: number;
  missingCount: number;
  sizeMismatchCount: number;
  unreadableCount: number;
  scannedFilesystemBytes: string;
  findings: Finding[];
};

/**
 * Bounded, cursor-paginated read-only comparison of tenant catalog records.
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
    principal: AuthenticatedPrincipal,
    cursor?: string
  ): Promise<StorageReconciliationResult> {
    if (
      cursor !== undefined &&
      (typeof cursor !== "string" || !CURSOR_UUID.test(cursor))
    ) {
      throw new BadRequestException("Cursor de conferência inválido.");
    }
    const { catalogCount, backups, nextCursor } = await this.prisma.withTenant(
      principal.organizationId,
      async tx => {
        const where = {
          organizationId: principal.organizationId,
          state: "COMPLETED",
        };
        // Explicitly resolve the cursor under the tenant's RLS scope.
        // A foreign/deleted backup ID cannot be used as a pagination anchor.
        if (cursor) {
          const anchor = await tx.backupRecord.findFirst({
            where: { ...where, id: cursor },
            select: { id: true },
          });
          if (!anchor) {
            throw new BadRequestException("Cursor de conferência inválido.");
          }
        }
        const [catalogCount, page] = await Promise.all([
          tx.backupRecord.count({ where }),
          tx.backupRecord.findMany({
            where,
            orderBy: [{ completedAt: "desc" }, { id: "desc" }],
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take: MAX_OBJECTS_PER_SCAN + 1,
            select: { id: true, byteCount: true },
          }),
        ]);
        const backups = page.slice(0, MAX_OBJECTS_PER_SCAN);
        const nextCursor =
          page.length > MAX_OBJECTS_PER_SCAN
            ? backups[backups.length - 1]!.id
            : null;
        return { catalogCount, backups, nextCursor };
      }
    );
    const report: StorageReconciliationResult = {
      configured: this.store !== null,
      scope: "COMPLETED_TENANT_BACKUPS",
      metadataOnly: true,
      scanLimit: MAX_OBJECTS_PER_SCAN,
      catalogCount,
      checkedCount: 0,
      complete: false,
      nextCursor: this.store ? nextCursor : null,
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
    report.complete = nextCursor === null;
    return report;
  }
}

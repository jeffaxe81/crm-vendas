import type {
  StorageGlobalInventory,
  StorageInventoryFindingStatus,
} from "@axes/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { BackupStore, BACKUP_ENVELOPE_OVERHEAD_BYTES } from "./backup-store";
import { BACKUP_STORE } from "./backup.service";

const PAGE_SIZE = 200;

type FindingStatus = StorageInventoryFindingStatus;

type CatalogRecord = {
  organizationId: string;
  state: string;
  byteCount: bigint | null;
};

export type GlobalInventoryTenant = StorageGlobalInventory["tenants"][number];
export type StorageGlobalInventoryResult = StorageGlobalInventory;

/**
 * Global metadata-only inventory. Catalog reads stay within the application's
 * ordinary restricted role and are individually scoped with FORCE RLS.
 * This observation cannot establish cryptographic integrity or restorability.
 */
@Injectable()
export class BackupStorageInventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BACKUP_STORE) private readonly store: BackupStore | null
  ) {}

  async scan(): Promise<StorageGlobalInventoryResult> {
    // organizations has no RLS; backups does. Never query backups globally.
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const tenants = new Map<string, GlobalInventoryTenant>();
    const catalog = new Map<string, CatalogRecord>();
    const catalogBytes = new Map<string, bigint>();
    const physicalBytes = new Map<string, bigint>();

    for (const { id: organizationId } of organizations) {
      tenants.set(organizationId, {
        organizationId,
        catalogCount: 0,
        completedCount: 0,
        physicalObjectCount: 0,
        catalogBytes: "0",
        physicalBytes: "0",
      });
      let cursor: string | undefined;
      while (true) {
        const page = await this.prisma.withTenant(organizationId, tx =>
          tx.backupRecord.findMany({
            where: { organizationId },
            select: {
              id: true,
              organizationId: true,
              state: true,
              byteCount: true,
            },
            orderBy: { id: "asc" },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            take: PAGE_SIZE,
          })
        );
        const tenant = tenants.get(organizationId)!;
        for (const item of page) {
          if (catalog.has(item.id)) {
            throw new Error("BACKUP_INVENTORY_DUPLICATE_ID");
          }
          catalog.set(item.id, item);
          tenant.catalogCount++;
          if (item.state === "COMPLETED") {
            tenant.completedCount++;
            if (item.byteCount !== null) {
              catalogBytes.set(
                organizationId,
                (catalogBytes.get(organizationId) ?? 0n) + item.byteCount
              );
            }
          }
        }
        if (page.length < PAGE_SIZE) break;
        cursor = page[page.length - 1]!.id;
      }
    }

    const result: StorageGlobalInventoryResult = {
      configured: this.store !== null,
      readOnly: true,
      complete: false,
      atomicSnapshot: false,
      scope: "ALL_ORGANIZATIONS",
      catalogCount: catalog.size,
      physicalObjectCount: 0,
      physicalBytes: "0",
      orphanCount: 0,
      missingCount: 0,
      sizeMismatchCount: 0,
      unreadableCount: 0,
      stateInconsistencyCount: 0,
      temporaryCount: 0,
      unexpectedCount: 0,
      tenants: Array.from(tenants.values()),
      findings: [],
    };
    for (const tenant of result.tenants) {
      const bytesForTenant = catalogBytes.get(tenant.organizationId) ?? 0n;
      tenant.catalogBytes = bytesForTenant.toString();
    }
    if (!this.store) return result;

    const seen = new Set<string>();
    let bytes = 0n;
    for await (const entry of this.store.inventoryEntries()) {
      if (entry.kind === "TEMPORARY") {
        result.temporaryCount++;
        continue;
      }
      if (entry.kind === "UNEXPECTED") {
        result.unexpectedCount++;
        continue;
      }
      if (seen.has(entry.id)) {
        throw new Error("BACKUP_INVENTORY_DUPLICATE_OBJECT");
      }
      seen.add(entry.id);
      result.physicalObjectCount++;
      const current = catalog.get(entry.id);
      const size = entry.kind === "OBJECT" ? BigInt(entry.size) : null;

      if (current) {
        tenants.get(current.organizationId)!.physicalObjectCount++;
      }
      if (size !== null) {
        bytes += size;
        if (current) {
          physicalBytes.set(
            current.organizationId,
            (physicalBytes.get(current.organizationId) ?? 0n) + size
          );
        }
      }

      const finding = (status: FindingStatus) => {
        result.findings.push({
          backupId: entry.id,
          organizationId: current?.organizationId ?? null,
          status,
          catalogBytes: current?.byteCount?.toString() ?? null,
          filesystemBytes: size?.toString() ?? null,
        });
      };
      if (!current) {
        result.orphanCount++;
        finding("ORPHAN");
      } else if (current.state === "DELETED") {
        result.stateInconsistencyCount++;
        finding("STATE_INCONSISTENCY");
      }
      if (entry.kind === "UNREADABLE_OBJECT") {
        result.unreadableCount++;
        finding("UNREADABLE");
        continue;
      }
      if (!current) continue;
      if (current.state !== "COMPLETED") continue;
      const expected =
        current.byteCount === null
          ? null
          : current.byteCount + BigInt(BACKUP_ENVELOPE_OVERHEAD_BYTES);
      if (expected === null || expected !== size) {
        result.sizeMismatchCount++;
        finding("SIZE_MISMATCH");
      }
    }

    for (const [backupId, item] of catalog) {
      if (item.state === "COMPLETED" && !seen.has(backupId)) {
        result.missingCount++;
        result.findings.push({
          backupId,
          organizationId: item.organizationId,
          status: "MISSING",
          catalogBytes: item.byteCount?.toString() ?? null,
          filesystemBytes: null,
        });
      }
    }
    result.physicalBytes = bytes.toString();
    for (const tenant of result.tenants) {
      const bytesForTenant = physicalBytes.get(tenant.organizationId) ?? 0n;
      tenant.physicalBytes = bytesForTenant.toString();
    }
    result.complete = true;
    return result;
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  BackupReasonSchema,
  BackupRecordSchema,
  type BackupRecord,
  type BackupReason,
  type BackupManifest,
} from "@axes/contracts";
import { PrismaService } from "../database/prisma.service";
import type {
  BackupRecord as StoredBackup,
  Prisma,
} from "../generated/prisma/client";
import { BackupStore } from "./backup-store";
import { BackupError } from "./backup-error";
import {
  canonical,
  decodeSnapshot,
  encodeSnapshot,
  type SnapshotData,
} from "./backup-manifest";
import { exportTenantSnapshot } from "./tenant-snapshot";
export const BACKUP_STORE = Symbol("BACKUP_STORE");
export const BACKUP_OPTIONS = Symbol("BACKUP_OPTIONS");
export type BackupOptions = { maxBytes: number; snapshotTimeoutMs: number };
export type VerifiedBackup = {
  bytes: Buffer;
  data: SnapshotData;
  manifest: BackupManifest;
  record: BackupRecord;
};
function uuid(value: string): string {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value
    )
  )
    throw new BackupError("BACKUP_INVALID");
  return value.toLowerCase();
}
function summary(row: StoredBackup): BackupRecord {
  return BackupRecordSchema.parse({
    ...row,
    byteCount: row.byteCount === null ? null : Number(row.byteCount),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}

/** Internal service only; HTTP authorization and durable job orchestration are added separately. */
@Injectable()
export class BackupService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(BACKUP_STORE) private readonly store: BackupStore | null,
    @Inject(BACKUP_OPTIONS) private readonly options: BackupOptions
  ) {}
  private async authorize(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string | null,
    reason: BackupReason
  ) {
    if (
      !(await tx.organization.findFirst({
        where: { id: organizationId, isActive: true },
        select: { id: true },
      }))
    )
      throw new BackupError("BACKUP_FORBIDDEN");
    if (actorId === null) {
      if (reason !== "SCHEDULED") throw new BackupError("BACKUP_FORBIDDEN");
      return;
    }
    if (
      !(await tx.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: actorId,
          isActive: true,
          isSuperuser: true,
          user: { isActive: true },
        },
        select: { id: true },
      }))
    )
      throw new BackupError("BACKUP_FORBIDDEN");
  }
  private async audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string | null,
    id: string,
    action: string,
    metadata: Prisma.InputJsonObject = {}
  ) {
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: actorId,
        requestId: id,
        action,
        entityType: "backup",
        entityId: id,
        metadata,
      },
    });
  }
  async create(
    organizationId: string,
    actorId: string | null,
    reason: BackupReason,
    requestedId?: string
  ): Promise<BackupRecord> {
    if (!this.store) throw new BackupError("BACKUP_NOT_CONFIGURED");
    const store = this.store;
    organizationId = uuid(organizationId);
    actorId = actorId === null ? null : uuid(actorId);
    const parsedReason = BackupReasonSchema.safeParse(reason);
    if (!parsedReason.success) throw new BackupError("BACKUP_INVALID");
    reason = parsedReason.data;
    const id = requestedId === undefined ? randomUUID() : uuid(requestedId);
    const existing = await this.prisma.withTenant(organizationId, async tx => {
      await this.authorize(tx, organizationId, actorId, reason);
      const row = await tx.backupRecord.findFirst({
        where: { id, organizationId },
      });
      if (row) {
        if (row.actorUserId !== actorId || row.reason !== reason) {
          throw new BackupError("BACKUP_INVALID");
        }
        if (row.state === "COMPLETED") {
          return summary(row);
        }
        if (row.state !== "FAILED") {
          throw new BackupError("BACKUP_IN_PROGRESS");
        }

        const retried = await tx.backupRecord.updateMany({
          where: {
            id,
            organizationId,
            state: "FAILED",
          },
          data: {
            state: "PENDING",
            errorCode: null,
            completedAt: null,
          },
        });
        if (retried.count !== 1) {
          throw new BackupError("BACKUP_IN_PROGRESS");
        }
        await this.audit(
          tx,
          organizationId,
          actorId,
          id,
          "backup.retry_requested",
          { reason }
        );
        return null;
      }
      await tx.backupRecord.create({
        data: {
          id,
          organizationId,
          actorUserId: actorId,
          reason,
          state: "PENDING",
        },
      });
      await this.audit(tx, organizationId, actorId, id, "backup.requested", {
        reason,
      });
      return null;
    });
    if (existing) {
      await this.verify(organizationId, id);
      return existing;
    }
    try {
      const bytes = await this.prisma.withTenant(
        organizationId,
        async tx => {
          await this.authorize(tx, organizationId, actorId, reason);
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            `backup:${organizationId}`
          );
          await tx.backupRecord.update({
            where: { id_organizationId: { id, organizationId } },
            data: { state: "RUNNING" },
          });
          const data = await exportTenantSnapshot(
            tx,
            organizationId,
            this.options.maxBytes
          );
          return encodeSnapshot(
            organizationId,
            data,
            new Date(),
            this.options.maxBytes
          );
        },
        {
          isolationLevel: "RepeatableRead",
          timeout: this.options.snapshotTimeoutMs,
        }
      );
      await store.put(id, bytes);
      const persisted = await store.read(id);
      const verified = decodeSnapshot(
        persisted,
        organizationId,
        this.options.maxBytes
      );
      if (!persisted.equals(bytes)) throw new BackupError("BACKUP_INVALID");
      const completed = await this.prisma.withTenant(
        organizationId,
        async tx => {
          await this.authorize(tx, organizationId, actorId, reason);
          const row = await tx.backupRecord.update({
            where: { id_organizationId: { id, organizationId } },
            data: {
              state: "COMPLETED",
              schemaVersion: verified.manifest.schemaVersion,
              checksum: verified.manifest.checksum,
              byteCount: BigInt(persisted.length),
              counts: verified.manifest.counts,
              completedAt: new Date(),
              errorCode: null,
            },
          });
          await this.audit(
            tx,
            organizationId,
            actorId,
            id,
            "backup.completed",
            {
              counts: verified.manifest.counts,
              schemaVersion: verified.manifest.schemaVersion,
            }
          );
          return row;
        }
      );
      return summary(completed);
    } catch (error) {
      const code = error instanceof BackupError ? error.code : "BACKUP_FAILED";
      try {
        await store.remove(id);
      } catch {
        /* Worker reconciliation must handle leftover private objects. */
      }
      try {
        await this.prisma.withTenant(organizationId, async tx => {
          await tx.backupRecord.update({
            where: { id_organizationId: { id, organizationId } },
            data: { state: "FAILED", errorCode: code },
          });
          await this.audit(tx, organizationId, actorId, id, "backup.failed", {
            errorCode: code,
          });
        });
      } catch {
        /* Leave a pending/running row for reconciliation when the database is unavailable. */
      }
      throw new BackupError(code);
    }
  }
  async pruneRetention(
    organizationId: string,
    retentionCount: 7 | 15 | 30 | 90
  ): Promise<number> {
    if (!this.store) throw new BackupError("BACKUP_NOT_CONFIGURED");
    if (![7, 15, 30, 90].includes(retentionCount)) {
      throw new BackupError("BACKUP_INVALID");
    }
    organizationId = uuid(organizationId);

    const candidates = await this.prisma.withTenant(
      organizationId,
      async tx => {
        const protectedRows = await tx.dataOperation.findMany({
          where: {
            organizationId,
            state: { in: ["PENDING", "RUNNING"] },
            preventiveBackupId: { not: null },
          },
          select: { preventiveBackupId: true },
        });
        const protectedIds = new Set(
          protectedRows
            .map(row => row.preventiveBackupId)
            .filter((id): id is string => id !== null)
        );
        const completed = await tx.backupRecord.findMany({
          where: { organizationId, state: "COMPLETED" },
          orderBy: [
            { completedAt: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          select: { id: true },
        });
        return completed
          .slice(retentionCount)
          .map(row => row.id)
          .filter(id => !protectedIds.has(id));
      }
    );

    let removed = 0;
    for (const id of candidates) {
      const deleted = await this.prisma.withTenant(organizationId, async tx => {
        const protectedByOperation = await tx.dataOperation.count({
          where: {
            organizationId,
            preventiveBackupId: id,
            state: { in: ["PENDING", "RUNNING"] },
          },
        });
        if (protectedByOperation > 0) return false;
        const row = await tx.backupRecord.findFirst({
          where: { id, organizationId, state: "COMPLETED" },
          select: { id: true },
        });
        if (!row) return false;
        await this.audit(
          tx,
          organizationId,
          null,
          id,
          "backup.retention_deleted"
        );
        await tx.backupRecord.delete({
          where: { id_organizationId: { id, organizationId } },
        });
        return true;
      });
      if (!deleted) continue;
      await this.store.remove(id);
      removed += 1;
    }
    return removed;
  }

  async verify(
    organizationId: string,
    backupId: string
  ): Promise<VerifiedBackup> {
    if (!this.store) throw new BackupError("BACKUP_NOT_CONFIGURED");
    organizationId = uuid(organizationId);
    backupId = uuid(backupId);
    const row = await this.prisma.withTenant(organizationId, tx =>
      tx.backupRecord.findFirst({
        where: { id: backupId, organizationId, state: "COMPLETED" },
      })
    );
    if (!row) throw new BackupError("BACKUP_NOT_FOUND");
    let bytes: Buffer;
    try {
      bytes = await this.store.read(backupId);
    } catch {
      throw new BackupError("BACKUP_INVALID");
    }
    const verified = decodeSnapshot(
      bytes,
      organizationId,
      this.options.maxBytes
    );
    if (
      row.schemaVersion !== verified.manifest.schemaVersion ||
      row.checksum !== verified.manifest.checksum ||
      row.byteCount !== BigInt(bytes.length) ||
      canonical(row.counts) !== canonical(verified.manifest.counts)
    )
      throw new BackupError("BACKUP_INVALID");
    return { ...verified, bytes, record: summary(row) };
  }
}

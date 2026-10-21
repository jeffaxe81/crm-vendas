import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import {
  decodeSnapshot,
  encodeSnapshot,
  snapshotDataFingerprint,
} from "./backup-manifest";
import type { BackupStore } from "./backup-store";
import { exportTenantSnapshot } from "./tenant-snapshot";

export type PreventiveRestoreCopy = {
  backupId: string;
  checksum: string;
  currentFingerprint: string;
};

/**
 * Internal, transactional staging primitive. No worker, HTTP route or restore
 * executor invokes this yet. The caller must own an exclusive maintenance
 * transaction and a fenced RUNNING RESTORE operation.
 *
 * The immutable encrypted file is published and read back BEFORE any catalog
 * or operation change. If the transaction rolls back or the process crashes,
 * the file may survive without a catalog row: the same operation ID can adopt
 * it only if it still matches the locked tenant snapshot. Never delete an
 * unowned object or overwrite an existing backup to make room.
 */
export async function stageRestorePreventiveCopy(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  operationId: string,
  workerId: string,
  attempts: number,
  store: BackupStore,
  maxBytes: number
): Promise<PreventiveRestoreCopy> {
  const [context] = await tx.$queryRawUnsafe<
    {
      maintenance: string | null;
      isolation: string;
      organization: string | null;
    }[]
  >(
    `SELECT current_setting('app.maintenance_authorized',true) AS maintenance,
       current_setting('transaction_isolation') AS isolation,
       current_setting('app.current_organization_id',true) AS organization`
  );
  if (
    context?.maintenance !== "on" ||
    !["repeatable read", "serializable"].includes(context.isolation) ||
    context.organization !== organizationId
  ) {
    throw new BackupError("RESTORE_MAINTENANCE_REQUIRED");
  }

  const operation = await tx.dataOperation.findFirst({
    where: {
      id: operationId,
      organizationId,
      actorUserId,
      kind: "RESTORE",
      state: "RUNNING",
      workerId,
      attempts,
      leaseUntil: { gt: new Date() },
      preventiveBackupId: null,
    },
    select: { id: true },
  });
  if (!operation) throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");

  // Use the operation UUID as the immutable backup object name. Retries must
  // read/adopt this object, never publish another version under a new name.
  const data = await exportTenantSnapshot(tx, organizationId, maxBytes);
  const currentFingerprint = snapshotDataFingerprint(data);
  const bytes = encodeSnapshot(organizationId, data, new Date(), maxBytes);
  try {
    await store.put(operationId, bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // A previous attempt may have committed its file but rolled back SQL.
    // Re-adopt only after authentication, decoding and current-state match.
  }

  const persisted = await store.read(operationId);
  const verified = decodeSnapshot(persisted, organizationId, maxBytes);
  if (snapshotDataFingerprint(verified.data) !== currentFingerprint) {
    throw new BackupError("RESTORE_PREVENTIVE_STALE");
  }

  await tx.backupRecord.create({
    data: {
      id: operationId,
      organizationId,
      actorUserId,
      reason: "PRE_RESTORE",
      state: "COMPLETED",
      schemaVersion: verified.manifest.schemaVersion,
      checksum: verified.manifest.checksum,
      byteCount: BigInt(persisted.length),
      counts: verified.manifest.counts,
      completedAt: new Date(),
    },
  });

  // Check the worker fence again after slow file I/O. The operation-to-backup
  // FK and catalog commit happen atomically inside the maintenance transaction.
  const linked = await tx.dataOperation.updateMany({
    where: {
      id: operationId,
      organizationId,
      actorUserId,
      kind: "RESTORE",
      state: "RUNNING",
      workerId,
      attempts,
      leaseUntil: { gt: new Date() },
      preventiveBackupId: null,
    },
    data: {
      preventiveBackupId: operationId,
      stage: "PREVENTIVE_VERIFIED",
    },
  });
  if (linked.count !== 1) {
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  }
  await tx.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      requestId: operationId,
      action: "restore.preventive_backup_verified",
      entityType: "data_operation",
      entityId: operationId,
      metadata: {
        backupId: operationId,
        checksum: verified.manifest.checksum,
        currentFingerprint,
      },
    },
  });

  return {
    backupId: operationId,
    checksum: verified.manifest.checksum,
    currentFingerprint,
  };
}

import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { VerifiedBackup } from "./backup.service";
import { preflightRestoreExecution } from "./restore-locked-preflight";
import {
  decodeSnapshot,
  encodeSnapshot,
  snapshotDataFingerprint,
} from "./backup-manifest";
import { BackupStoreIntegrityError, type BackupStore } from "./backup-store";
import { exportTenantSnapshot } from "./tenant-snapshot";
import { preflightDeletionExecution } from "./recovery-deletion-preflight";

export type PreventiveRestoreCopy = {
  backupId: string;
  checksum: string;
  currentFingerprint: string;
};

/**
 * Internal, transactional staging primitive. No worker, HTTP route or restore
 * executor invokes this yet. The caller must own an exclusive maintenance
 * transaction, a fenced RUNNING RESTORE operation, and provide a verified
 * target backup. The target catalog is rechecked under the lock.
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
  target: VerifiedBackup | null,
  store: BackupStore,
  maxBytes: number,
  kind: "RESTORE" | "DELETE" = "RESTORE"
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
      kind,
      state: "RUNNING",
      workerId,
      attempts,
      leaseUntil: { gt: new Date() },
      preventiveBackupId: null,
    },
    select: { id: true },
  });
  if (!operation) throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");

  // A completed catalog entry can be revoked or mutated after verification.
  // Before publishing ANY immutable file, repeat the full target/tenant,
  // reference and restore-policy checks under the same maintenance snapshot.
  if (kind === "RESTORE" && !target)
    throw new BackupError("RESTORE_TARGET_INVALID");
  const locked =
    kind === "RESTORE"
      ? await preflightRestoreExecution(tx, organizationId, target!, maxBytes)
      : await preflightDeletionExecution(tx, organizationId, maxBytes);

  // The verified target was read before the maintenance lock. Its catalog
  // may still be COMPLETED even if storage has since lost or replaced the
  // ciphertext. Reauthenticate the exact pinned target before publication.
  if (target) {
    let currentTarget: Buffer;
    try {
      currentTarget = await store.read(target.record.id);
    } catch (error) {
      if (
        error instanceof BackupStoreIntegrityError ||
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        throw new BackupError("RESTORE_TARGET_INVALID");
      throw error;
    }
    if (!currentTarget.equals(target.bytes))
      throw new BackupError("RESTORE_TARGET_INVALID");
  }

  // Use the operation UUID as the immutable backup object name. Retries must
  // read/adopt this object, never publish another version under a new name.
  const data = await exportTenantSnapshot(tx, organizationId, maxBytes);
  const currentFingerprint = snapshotDataFingerprint(data);
  if (currentFingerprint !== locked.currentFingerprint)
    throw new BackupError("RESTORE_PREVIEW_STALE");
  const bytes = encodeSnapshot(organizationId, data, new Date(), maxBytes);
  try {
    await store.read(operationId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await store.put(operationId, bytes);
    } catch (publicationError) {
      if ((publicationError as NodeJS.ErrnoException).code !== "EEXIST")
        throw publicationError;
    }
  }

  const persisted = await store.read(operationId);
  const verified = decodeSnapshot(persisted, organizationId, maxBytes);
  if (snapshotDataFingerprint(verified.data) !== currentFingerprint) {
    throw new BackupError("RESTORE_PREVENTIVE_STALE");
  }

  const existing = await tx.backupRecord.findFirst({
    where: { id: operationId, organizationId },
  });
  const reason = kind === "RESTORE" ? "PRE_RESTORE" : "PRE_DELETE";
  if (
    existing &&
    (existing.actorUserId !== actorUserId ||
      existing.reason !== reason ||
      !["PENDING", "RUNNING", "FAILED", "COMPLETED"].includes(existing.state))
  )
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  const catalog = {
    id: operationId,
    organizationId,
    actorUserId,
    reason,
    state: "COMPLETED",
    schemaVersion: verified.manifest.schemaVersion,
    checksum: verified.manifest.checksum,
    byteCount: BigInt(persisted.length),
    counts: verified.manifest.counts,
    completedAt: new Date(),
  };
  await tx.backupRecord.upsert({
    where: { id_organizationId: { id: operationId, organizationId } },
    create: catalog,
    update: catalog,
  });

  // Check the worker fence again after slow file I/O. The operation-to-backup
  // FK and catalog commit happen atomically inside the maintenance transaction.
  const linked = await tx.dataOperation.updateMany({
    where: {
      id: operationId,
      organizationId,
      actorUserId,
      kind,
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
      action: `${kind.toLowerCase()}.preventive_backup_verified`,
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

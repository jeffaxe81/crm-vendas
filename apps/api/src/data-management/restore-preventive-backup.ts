import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import {
  decodeSnapshot,
  encodeSnapshot,
  snapshotDataFingerprint,
} from "./backup-manifest";
import type { VerifiedBackup } from "./backup.service";
import type { BackupStore } from "./backup-store";
import { preflightRestoreExecution } from "./restore-locked-preflight";
import { exportTenantSnapshot } from "./tenant-snapshot";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type PreventiveRestoreBackup = {
  backupId: string;
  checksum: string;
  currentFingerprint: string;
};

/**
 * INTERNAL primitive only. The caller MUST supply the same exclusive
 * RepeatableRead withMaintenance transaction used for the eventual restore.
 * There is intentionally no HTTP route, background worker or automatic caller.
 *
 * A published file cannot be rolled back with its SQL transaction. If any
 * subsequent step fails, the unreferenced, encrypted file must remain private
 * and be reconciled separately; it must NEVER be treated as a completed copy.
 */
export async function persistPreventiveRestoreBackup(
  tx: Prisma.TransactionClient,
  organizationId: string,
  operationId: string,
  target: VerifiedBackup,
  store: BackupStore,
  maxBytes: number
): Promise<PreventiveRestoreBackup> {
  if (!UUID.test(organizationId) || !UUID.test(operationId)) {
    throw new BackupError("RESTORE_TARGET_INVALID");
  }

  // Checks both the exclusive tenant lock and the still-valid target catalog,
  // as well as the current/target policy, references and foreign identities.
  const ready = await preflightRestoreExecution(
    tx,
    organizationId,
    target,
    maxBytes
  );

  // Do not publish files for another tenant, finished operation or an
  // operation that already owns a preventive backup.
  const operation = await tx.dataOperation.findFirst({
    where: {
      id: operationId,
      organizationId,
      kind: "RESTORE",
      state: "RUNNING",
      preventiveBackupId: null,
      actorUserId: { not: null },
    },
    select: { id: true, actorUserId: true },
  });
  if (!operation || !operation.actorUserId) {
    throw new BackupError("RESTORE_PREVENTIVE_BACKUP_REQUIRED");
  }

  const current = await exportTenantSnapshot(tx, organizationId, maxBytes);
  const fingerprint = snapshotDataFingerprint(current);
  if (fingerprint !== ready.currentFingerprint) {
    throw new BackupError("RESTORE_PREVIEW_STALE");
  }

  const bytes = encodeSnapshot(organizationId, current, new Date(), maxBytes);
  const backupId = randomUUID();

  // AES-256-GCM publication is immutable, fsynced and never overwrites an
  // existing object. Re-reading authenticates both ciphertext and object ID.
  await store.put(backupId, bytes);
  let saved: Buffer;
  try {
    saved = await store.read(backupId);
  } catch {
    throw new BackupError("RESTORE_PREVENTIVE_BACKUP_INVALID");
  }
  if (!saved.equals(bytes)) {
    throw new BackupError("RESTORE_PREVENTIVE_BACKUP_INVALID");
  }
  let manifest;
  try {
    manifest = decodeSnapshot(saved, organizationId, maxBytes).manifest;
  } catch {
    throw new BackupError("RESTORE_PREVENTIVE_BACKUP_INVALID");
  }

  // Catalog completion and operation binding are a single SQL transaction.
  // Nothing attaches the backup before encrypted round-trip verification.
  await tx.backupRecord.create({
    data: {
      id: backupId,
      organizationId,
      actorUserId: operation.actorUserId,
      reason: "PRE_RESTORE",
      state: "COMPLETED",
      schemaVersion: manifest.schemaVersion,
      checksum: manifest.checksum,
      byteCount: BigInt(saved.length),
      counts: manifest.counts,
      completedAt: new Date(),
    },
  });
  const attached = await tx.dataOperation.updateMany({
    where: {
      id: operationId,
      organizationId,
      kind: "RESTORE",
      state: "RUNNING",
      preventiveBackupId: null,
    },
    data: {
      preventiveBackupId: backupId,
      stage: "PREVENTIVE_BACKUP_READY",
    },
  });
  if (attached.count !== 1) {
    throw new BackupError("RESTORE_PREVENTIVE_BACKUP_REQUIRED");
  }

  await tx.auditLog.create({
    data: {
      organizationId,
      actorUserId: operation.actorUserId,
      requestId: operationId,
      action: "restore.preventive_backup_verified",
      entityType: "backup",
      entityId: backupId,
      metadata: {
        operationId,
        checksum: manifest.checksum,
        currentFingerprint: fingerprint,
      },
    },
  });

  return {
    backupId,
    checksum: manifest.checksum,
    currentFingerprint: fingerprint,
  };
}

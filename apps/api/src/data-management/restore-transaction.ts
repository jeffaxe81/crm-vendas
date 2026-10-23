import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PasswordService } from "../auth/password.service";
import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { VerifiedBackup } from "./backup.service";
import type { BackupStore } from "./backup-store";
import {
  consumeRestoreConfirmation,
  type RestoreConfirmation,
} from "./restore-confirmation";
import { restoreTenantSnapshot } from "./restore-executor";
import { stageRestorePreventiveCopy } from "./restore-preventive-copy";

export type RestoreExecutionFence = {
  operationId: string;
  workerId: string;
  attempts: number;
};

export type CompletedRestore = {
  preventiveBackupId: string;
  targetBackupId: string;
  checksum: string;
};

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * INTERNAL ONLY: no controller, worker or public module calls this function.
 *
 * The caller must supply one exclusive, RepeatableRead withMaintenance
 * transaction. Confirmation, preventive catalog and restore mutations commit
 * atomically, or NONE of their SQL changes commit. An encrypted immutable
 * preventive file may survive a rollback; a retried operation can adopt it
 * only after the existing snapshot/fingerprint checks succeed.
 *
 * No caller may expose this until model coverage, operational recovery, lease
 * strategy and real-environment restore/rollback homologation are approved.
 */
export async function executeConfirmedRestoreLocked(
  tx: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  confirmation: RestoreConfirmation,
  fence: RestoreExecutionFence,
  target: VerifiedBackup,
  passwords: PasswordService,
  store: BackupStore,
  maxBytes: number
): Promise<CompletedRestore> {
  if (
    !fence ||
    !uuid.test(fence.operationId ?? "") ||
    typeof fence.workerId !== "string" ||
    !/^[A-Za-z0-9_.:-]{1,160}$/.test(fence.workerId) ||
    !Number.isSafeInteger(fence.attempts) ||
    fence.attempts < 1
  ) {
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  }

  // Bind the durable claim to this session's exact preview and target before
  // consuming the single-use confirmation or publishing an immutable object.
  const operation = await tx.dataOperation.findFirst({
    where: {
      id: fence.operationId,
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      kind: "RESTORE",
      state: "RUNNING",
      workerId: fence.workerId,
      attempts: fence.attempts,
      leaseUntil: { gt: new Date() },
      preventiveBackupId: null,
    },
    select: { payload: true },
  });
  const payload = operation?.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.previewId !== confirmation?.previewId ||
    payload.targetBackupId !== target.record.id
  ) {
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  }

  // All three operations use the SAME maintenance transaction. Confirmation
  // runs first: invalid credentials/expired previews cannot publish a copy.
  await consumeRestoreConfirmation(
    tx,
    principal,
    confirmation,
    target,
    passwords,
    maxBytes
  );

  // Verified, fenced, encrypted and cataloged before the first business DELETE.
  const preventive = await stageRestorePreventiveCopy(
    tx,
    principal.organizationId,
    principal.userId,
    fence.operationId,
    fence.workerId,
    fence.attempts,
    target,
    store,
    maxBytes
  );

  await restoreTenantSnapshot(tx, principal.organizationId, target.data);

  // A lost lease after slow I/O or graph replacement aborts the entire SQL
  // transaction, including preview consumption, catalog, restore and audits.
  const completed = await tx.dataOperation.updateMany({
    where: {
      id: fence.operationId,
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      kind: "RESTORE",
      state: "RUNNING",
      workerId: fence.workerId,
      attempts: fence.attempts,
      leaseUntil: { gt: new Date() },
      preventiveBackupId: preventive.backupId,
    },
    data: {
      state: "COMPLETED",
      stage: "COMPLETED",
      checkpoint: {
        businessCommitted: true,
        previewId: confirmation.previewId,
        targetBackupId: target.record.id,
        preventiveBackupId: preventive.backupId,
      },
      processed: 1,
      total: 1,
      completedAt: new Date(),
      leaseUntil: null,
    },
  });
  if (completed.count !== 1) {
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  }

  await tx.auditLog.create({
    data: {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: fence.operationId,
      action: "restore.completed",
      entityType: "data_operation",
      entityId: fence.operationId,
      metadata: {
        targetBackupId: target.record.id,
        preventiveBackupId: preventive.backupId,
        targetChecksum: target.manifest.checksum,
        previewId: confirmation.previewId,
      },
    },
  });

  return {
    preventiveBackupId: preventive.backupId,
    targetBackupId: target.record.id,
    checksum: target.manifest.checksum,
  };
}

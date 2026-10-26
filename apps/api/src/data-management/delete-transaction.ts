import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import type { Prisma } from "../generated/prisma/client";
import type { PasswordService } from "../auth/password.service";
import type { BackupStore } from "./backup-store";
import { BackupError } from "./backup-error";
import {
  consumeRestoreConfirmation,
  type RestoreConfirmation,
} from "./restore-confirmation";
import { stageRestorePreventiveCopy } from "./restore-preventive-copy";
import { preflightDeletionExecution } from "./recovery-deletion-preflight";
import { restoreTenantSnapshot } from "./restore-executor";
import type { RestoreExecutionFence } from "./restore-transaction";

export async function executeConfirmedDeletionLocked(
  tx: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  confirmation: RestoreConfirmation,
  fence: RestoreExecutionFence,
  passwords: PasswordService,
  store: BackupStore,
  maxBytes: number
) {
  const operation = await tx.dataOperation.findFirst({
    where: {
      id: fence.operationId,
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      kind: "DELETE",
      state: "RUNNING",
      workerId: fence.workerId,
      attempts: fence.attempts,
      leaseUntil: { gt: new Date() },
      preventiveBackupId: null,
    },
  });
  const payload = operation?.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.previewId !== confirmation.previewId ||
    payload.targetBackupId !== null
  )
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  await consumeRestoreConfirmation(
    tx,
    principal,
    confirmation,
    null,
    passwords,
    maxBytes,
    "DELETE"
  );
  const preventive = await stageRestorePreventiveCopy(
    tx,
    principal.organizationId,
    principal.userId,
    fence.operationId,
    fence.workerId,
    fence.attempts,
    null,
    store,
    maxBytes,
    "DELETE"
  );
  const target = await preflightDeletionExecution(
    tx,
    principal.organizationId,
    maxBytes
  );
  await restoreTenantSnapshot(tx, principal.organizationId, target.target);
  const completed = await tx.dataOperation.updateMany({
    where: {
      id: fence.operationId,
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      kind: "DELETE",
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
        preventiveBackupId: preventive.backupId,
      },
      processed: 1,
      total: 1,
      completedAt: new Date(),
      leaseUntil: null,
    },
  });
  if (completed.count !== 1)
    throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
  await tx.auditLog.create({
    data: {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: fence.operationId,
      action: "delete.completed",
      entityType: "data_operation",
      entityId: fence.operationId,
      metadata: {
        previewId: confirmation.previewId,
        preventiveBackupId: preventive.backupId,
        currentCounts: target.currentCounts,
        targetCounts: target.targetCounts,
      },
    },
  });
  return { preventiveBackupId: preventive.backupId, targetBackupId: null };
}

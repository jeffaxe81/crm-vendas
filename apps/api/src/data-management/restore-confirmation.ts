import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import type { Prisma } from "../generated/prisma/client";
import { PasswordService } from "../auth/password.service";
import { BackupError } from "./backup-error";
import type { VerifiedBackup } from "./backup.service";
import { preflightRestoreExecution } from "./restore-locked-preflight";

export const RESTORE_CONFIRMATION_PHRASE = "RESTAURAR DADOS";

export type RestoreConfirmation = {
  previewId: string;
  password: string;
  confirmation: string;
};

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Internal transaction-only gate for a future restore executor.
 *
 * Must be invoked in the SAME exclusive, repeatable-read maintenance
 * transaction that will replace tenant data. This is not an HTTP endpoint
 * and does not perform restoration. A failed restore rolls back consumption
 * and audit together with its business changes.
 */
export async function consumeRestoreConfirmation(
  tx: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  input: RestoreConfirmation,
  verified: VerifiedBackup,
  passwords: PasswordService,
  maxBytes: number
): Promise<void> {
  if (
    principal.authMethod !== "session" ||
    principal.isSuperuser !== true ||
    !uuid.test(principal.organizationId) ||
    !uuid.test(principal.userId) ||
    !uuid.test(principal.membershipId) ||
    !uuid.test(principal.sessionId)
  ) {
    throw new BackupError("RESTORE_FORBIDDEN");
  }

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
    context.organization !== principal.organizationId
  ) {
    throw new BackupError("RESTORE_MAINTENANCE_REQUIRED");
  }

  if (
    !input ||
    !uuid.test(input.previewId ?? "") ||
    typeof input.password !== "string" ||
    input.password.length < 1 ||
    input.password.length > 1024 ||
    input.confirmation !== RESTORE_CONFIRMATION_PHRASE ||
    verified.record.organizationId !== principal.organizationId ||
    verified.manifest.organizationId !== principal.organizationId ||
    verified.record.checksum !== verified.manifest.checksum
  ) {
    throw new BackupError("RESTORE_CONFIRMATION_INVALID");
  }

  const now = new Date();
  const [membership, session, user, preview] = await Promise.all([
    tx.organizationMembership.findFirst({
      where: {
        id: principal.membershipId,
        organizationId: principal.organizationId,
        userId: principal.userId,
        isActive: true,
        isSuperuser: true,
        organization: { isActive: true },
      },
      select: { id: true },
    }),
    tx.refreshSession.findFirst({
      where: {
        id: principal.sessionId,
        organizationId: principal.organizationId,
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
    tx.user.findFirst({
      where: { id: principal.userId, isActive: true },
      select: { passwordHash: true },
    }),
    tx.operationPreview.findFirst({
      where: {
        id: input.previewId,
        organizationId: principal.organizationId,
        actorUserId: principal.userId,
        sessionId: principal.sessionId,
        kind: "RESTORE",
        targetBackupId: verified.record.id,
        targetChecksum: verified.manifest.checksum,
        consumedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);
  if (!membership || !session || !user || !preview) {
    throw new BackupError("RESTORE_CONFIRMATION_INVALID");
  }

  const passwordCorrect = await passwords
    .verify(user.passwordHash, input.password)
    .catch(() => false);
  if (!passwordCorrect) {
    throw new BackupError("RESTORE_CONFIRMATION_INVALID");
  }

  // Re-run target/reference/identity readiness and current-state fingerprint
  // under the same exclusive maintenance lock that will guard restoration.
  const locked = await preflightRestoreExecution(
    tx,
    principal.organizationId,
    verified,
    maxBytes
  );
  const fingerprint = locked.currentFingerprint;
  if (fingerprint !== preview.currentFingerprint) {
    throw new BackupError("RESTORE_PREVIEW_STALE");
  }

  const consumed = await tx.operationPreview.updateMany({
    where: {
      id: preview.id,
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      kind: "RESTORE",
      targetBackupId: verified.record.id,
      targetChecksum: verified.manifest.checksum,
      currentFingerprint: fingerprint,
      expiresAt: { gt: new Date() },
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new BackupError("RESTORE_CONFIRMATION_INVALID");
  }

  await tx.auditLog.create({
    data: {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: preview.id,
      action: "restore.confirmation_consumed",
      entityType: "operation_preview",
      entityId: preview.id,
      metadata: {
        backupId: verified.record.id,
        targetChecksum: verified.manifest.checksum,
      },
    },
  });
}

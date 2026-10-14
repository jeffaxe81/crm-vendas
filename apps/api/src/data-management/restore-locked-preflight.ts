import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import {
  snapshotDataFingerprint,
  type SnapshotData,
} from "./backup-manifest";
import type { VerifiedBackup } from "./backup.service";
import { validateRestoreIdentityReferences } from "./restore-identity-check";
import { validateRestoreReferences } from "./restore-reference-check";
import { exportTenantSnapshot } from "./tenant-snapshot";

export type RestoreLockedPreflight = {
  currentFingerprint: string;
  targetChecksum: string;
  currentCounts: Record<string, number>;
  targetCounts: Record<string, number>;
};

function counts(data: SnapshotData): Record<string, number> {
  return Object.fromEntries(
    Object.entries(data).map(([model, rows]) => [model, rows.length])
  );
}

/**
 * Revalidates a verified restore target against the live tenant state while
 * writes are exclusively blocked for that organization.
 *
 * This function is deliberately read-only. It does not consume confirmation,
 * mutate tenant business data, create a preventive backup, or execute restore.
 */
export async function preflightRestoreExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  verified: VerifiedBackup,
  maxBytes: number
): Promise<RestoreLockedPreflight> {
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

  if (
    verified.record.organizationId !== organizationId ||
    verified.manifest.organizationId !== organizationId ||
    verified.record.checksum !== verified.manifest.checksum
  ) {
    throw new BackupError("RESTORE_TARGET_INVALID");
  }

  validateRestoreReferences(verified.data);
  await validateRestoreIdentityReferences(tx, organizationId, verified.data);

  const current = await exportTenantSnapshot(tx, organizationId, maxBytes);

  return {
    currentFingerprint: snapshotDataFingerprint(current),
    targetChecksum: verified.manifest.checksum,
    currentCounts: counts(current),
    targetCounts: { ...verified.manifest.counts },
  };
}

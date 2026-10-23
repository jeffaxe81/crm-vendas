import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import {
  canonical,
  snapshotDataFingerprint,
  type SnapshotData,
} from "./backup-manifest";
import type { VerifiedBackup } from "./backup.service";
import { validateRestoreIdentityReferences } from "./restore-identity-check";
import { validateRestorePreservedMemberships } from "./restore-membership-check";
import { unsupportedRestoreModels } from "./restore-executor";
import { validateRestoreReferences } from "./restore-reference-check";
import { exportTenantSnapshot } from "./tenant-snapshot";
import { requireSupportedTicketRestoreDependencies } from "./restore-ticket-dependencies";

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
    verified.record.checksum !== verified.manifest.checksum ||
    verified.record.byteCount !== verified.bytes.length
  ) {
    throw new BackupError("RESTORE_TARGET_INVALID");
  }

  // Verification is a point-in-time read. A preview must not authorize
  // restoration of a copy later revoked, deleted or replaced in the catalog.
  // Recheck under the exclusive maintenance transaction, before confirmation
  // is consumed or any tenant data is modified.
  const catalog = await tx.backupRecord.findFirst({
    where: {
      id: verified.record.id,
      organizationId,
      state: "COMPLETED",
      checksum: verified.manifest.checksum,
      schemaVersion: verified.manifest.schemaVersion,
      byteCount: BigInt(verified.bytes.length),
    },
    select: { counts: true },
  });
  if (
    !catalog ||
    canonical(catalog.counts) !== canonical(verified.manifest.counts)
  ) {
    throw new BackupError("RESTORE_TARGET_INVALID");
  }

  validateRestoreReferences(verified.data);
  await validateRestoreIdentityReferences(tx, organizationId, verified.data);
  await validateRestorePreservedMemberships(tx, organizationId, verified.data);

  const current = await exportTenantSnapshot(tx, organizationId, maxBytes);
  const currentCounts = counts(current);
  // Fail closed before consuming the one-time confirmation. A model in either
  // state must not be silently omitted by the current partial restore executor.
  if (
    unsupportedRestoreModels(currentCounts, verified.manifest.counts).length
  ) {
    throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
  }

  // Fail before confirmation consumption or preventive file publication.
  await requireSupportedTicketRestoreDependencies(
    tx,
    organizationId,
    verified.data
  );

  return {
    currentFingerprint: snapshotDataFingerprint(current),
    targetChecksum: verified.manifest.checksum,
    currentCounts,
    targetCounts: { ...verified.manifest.counts },
  };
}

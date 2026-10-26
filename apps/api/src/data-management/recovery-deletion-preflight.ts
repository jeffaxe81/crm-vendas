import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import { snapshotDataFingerprint } from "./backup-manifest";
import { exportTenantSnapshot } from "./tenant-snapshot";
import { protectedOperationalDeletionSnapshot } from "./protected-delete-snapshot";
import { unsupportedRestoreModels } from "./restore-executor";
import { validateRestoreIdentityReferences } from "./restore-identity-check";
import { validateRestorePreservedMemberships } from "./restore-membership-check";

export async function deletionSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  maxBytes: number
) {
  const current = await exportTenantSnapshot(tx, organizationId, maxBytes);
  const outbox = await tx.emailOutbox.findMany({
    where: { organizationId },
    select: { ticketId: true },
    distinct: ["ticketId"],
  });
  const target = protectedOperationalDeletionSnapshot(
    current,
    outbox.map(row => row.ticketId)
  );
  const counts = (data: typeof current) =>
    Object.fromEntries(
      Object.entries(data).map(([name, rows]) => [name, rows.length])
    );
  if (unsupportedRestoreModels(counts(current), counts(target)).length)
    throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
  await validateRestoreIdentityReferences(tx, organizationId, target);
  await validateRestorePreservedMemberships(tx, organizationId, target);
  return {
    current,
    target,
    currentCounts: counts(current),
    targetCounts: counts(target),
    currentFingerprint: snapshotDataFingerprint(current),
    targetFingerprint: snapshotDataFingerprint(target),
  };
}

export async function preflightDeletionExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  maxBytes: number
) {
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
    context.organization !== organizationId ||
    !["repeatable read", "serializable"].includes(context.isolation)
  )
    throw new BackupError("RESTORE_MAINTENANCE_REQUIRED");
  return deletionSnapshot(tx, organizationId, maxBytes);
}

import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";

/**
 * Read-only check for references to memberships that restore deliberately
 * preserves. A snapshot's historical membership projection is not proof
 * that the same tenant/user pair still exists in the live database.
 *
 * Call from both preview preflight and the internal executor under the
 * maintenance transaction. Never recreate or switch identity bindings.
 */
export async function validateRestorePreservedMemberships(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: SnapshotData
): Promise<void> {
  if (
    !Array.isArray(data?.Opportunity) ||
    !Array.isArray(data?.UserWorkspacePreference)
  ) {
    throw new BackupError("RESTORE_TARGET_INVALID");
  }

  const ids = new Set<string>();
  for (const [rows, key] of [
    [data.Opportunity, "ownerUserId"],
    [data.UserWorkspacePreference, "userId"],
  ] as const) {
    for (const row of rows) {
      const id = row?.[key];
      if (typeof id !== "string") {
        throw new BackupError("RESTORE_TARGET_INVALID");
      }
      ids.add(id);
    }
  }

  const userIds = [...ids].sort();
  if (userIds.length === 0) return;

  const memberships = await tx.organizationMembership.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true },
  });
  const present = new Set(memberships.map(row => row.userId));
  if (userIds.some(id => !present.has(id))) {
    throw new BackupError("RESTORE_MEMBERSHIP_REFERENCE_MISSING");
  }
}

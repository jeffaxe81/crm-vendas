import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";

/**
 * Validate identity bindings against the tenant's current database state.
 * Restores preserve authentication credentials and must never create users
 * from the name/email projections embedded in a backup.
 *
 * This is a read-only readiness check, not a restore executor. It must run
 * again under the exclusive maintenance lock immediately before restoration.
 */
export async function validateRestoreIdentityReferences(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: SnapshotData
): Promise<void> {
  const userRows = data.User ?? [];
  const userIds = userRows.map(row => row.id as string);
  const existingUsers = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const users = new Map(existingUsers.map(user => [user.id, user.email]));

  for (const row of userRows) {
    if (!users.has(row.id as string)) {
      throw new BackupError("RESTORE_USER_REFERENCE_MISSING");
    }
    if (users.get(row.id as string) !== row.email) {
      throw new BackupError("RESTORE_USER_IDENTITY_CHANGED");
    }
  }

  const membershipRows = data.OrganizationMembership ?? [];
  const membershipIds = membershipRows.map(row => row.id as string);
  const existingMemberships = await tx.organizationMembership.findMany({
    where: {
      organizationId,
      id: { in: membershipIds },
    },
    select: { id: true, userId: true },
  });
  const memberships = new Map(
    existingMemberships.map(membership => [membership.id, membership.userId])
  );
  for (const row of membershipRows) {
    const id = row.id as string;
    if (memberships.has(id) && memberships.get(id) !== row.userId) {
      throw new BackupError("RESTORE_MEMBERSHIP_IDENTITY_CHANGED");
    }
  }
}

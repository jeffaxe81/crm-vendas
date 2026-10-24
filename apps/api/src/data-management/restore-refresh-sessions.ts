import type { Prisma } from "../generated/prisma/client";

/**
 * Refresh sessions are security state, not snapshot data. Preserve every row,
 * keep historical revocation timestamps intact, and revoke only sessions that
 * are still active for the tenant whose business data was restored.
 *
 * This runs inside the same maintenance transaction as the graph replacement,
 * so a later restore failure rolls the revocation back atomically.
 */
export async function revokeActiveRefreshSessionsAfterRestore(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  await tx.refreshSession.updateMany({
    where: {
      organizationId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

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
  await tx.$executeRawUnsafe(
    `UPDATE public.refresh_sessions
     SET revoked_at=clock_timestamp()
     WHERE organization_id=$1::uuid
       AND revoked_at IS NULL`,
    organizationId
  );
}

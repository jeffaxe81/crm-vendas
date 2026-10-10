import type { Prisma } from "../generated/prisma/client";
/** Maintenance -> gate -> row is the common acquisition order for all writers. */
export function webhookConnectionLockKey(organizationId: string): string {
  return `webhook-connection:${organizationId}`;
}

export async function lockWebhookTransaction(
  tenant: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  await tenant.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`tenant-maintenance:${organizationId}`},0))`;
  await tenant.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${webhookConnectionLockKey(organizationId)},0))`;
}

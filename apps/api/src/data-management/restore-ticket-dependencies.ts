import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";

/** Preserve encrypted mail and require every referenced Ticket to exist in the target graph.
 * The deferrable FK and pause policy apply inside the exclusive maintenance transaction.
 */
export async function requireSupportedTicketRestoreDependencies(
  tx: Prisma.TransactionClient,
  organizationId: string,
  target: SnapshotData
): Promise<void> {
  const outbox = await tx.emailOutbox.findMany({
    where: { organizationId },
    select: { ticketId: true },
    distinct: ["ticketId"],
  });
  const tickets = new Set(target.Ticket?.map(row => row.id));
  if (outbox.some(row => !tickets.has(row.ticketId))) {
    throw new BackupError("RESTORE_PRESERVED_REFERENCE_MISSING");
  }
}

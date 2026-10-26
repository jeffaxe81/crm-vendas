import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";

/**
 * Ticket/TicketEvent use REPLACE. CSAT now has an explicit
 * RENEW_EXPIRED_TOKEN replacement path, but encrypted outbox rows remain
 * EXCLUDE/PRESERVE and still hold a RESTRICT FK to Ticket.
 *
 * Must run inside an exclusive tenant maintenance transaction. Keeping the
 * predicate here allows both the locked preflight and the internal executor
 * to fail closed even if a caller bypasses one of them.
 */
export async function requireSupportedTicketRestoreDependencies(
  tx: Prisma.TransactionClient,
  organizationId: string,
  target: SnapshotData
): Promise<void> {
  // The target is validated separately by validateTicketSatisfactionRestore.
  // Keep it in this signature so preflight/executor use one dependency gate.

  // Never delete or rewrite encrypted outbox rows merely to make Ticket
  // replacement possible. Until EmailOutbox has its own reviewed policy,
  // any live row keeps restore fail-closed.
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

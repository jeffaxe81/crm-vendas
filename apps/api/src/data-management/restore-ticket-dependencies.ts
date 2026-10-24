import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";

/**
 * Ticket/TicketEvent use REPLACE, but their dependent security/CSAT records
 * do not. Refuse an unsafe restore before the first DELETE until the
 * specialized policies are implemented and independently tested.
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
  // RENEW_EXPIRED_TOKEN is not implemented by the current internal graph.
  // A nonempty snapshot must not be silently ignored.
  if ((target.TicketSatisfactionSurvey?.length ?? 0) > 0) {
    throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
  }

  // These rows outlive the replaced Ticket table. CSAT holds a restrict FK,
  // while encrypted outbox objects are deliberately excluded from exports.
  // Do not mutate/delete either record class merely to make restore possible.
  const [surveys, outbox] = await Promise.all([
    tx.ticketSatisfactionSurvey.count({ where: { organizationId } }),
    tx.emailOutbox.count({ where: { organizationId } }),
  ]);
  if (surveys > 0 || outbox > 0) {
    throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
  }
}

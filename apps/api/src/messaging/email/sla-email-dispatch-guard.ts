import { PrismaService } from "../../database/prisma.service";
import { composeSlaDueEmail } from "./email-composer";
import type { TransactionalEmail } from "./email-provider";

const ALERT_WINDOW_MS = 30 * 60 * 1000;

/**
 * F4.3-02B2A: fail closed on an alert that is no longer actionable.
 * Always read the latest ticket and assignee inside the tenant's RLS
 * context before handing the decrypted email to the transport.
 *
 * A provider must still support idempotency for network-acceptance
 * uncertainty; this check does not make read/send atomic.
 */
export async function isSlaEmailStillCurrent(
  prisma: PrismaService,
  email: TransactionalEmail,
  now: Date
): Promise<boolean> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("INVALID_SLA_EMAIL_CLOCK");
  // Satisfaction requests require an independent consent policy. Do not send
  // them through an SLA-only dispatch path.
  if (email.purpose !== "SLA_DUE_SOON") return false;

  const ticket = await prisma.withTenant(email.organizationId, tx =>
    tx.ticket.findFirst({
      where: {
        id: email.referenceId,
        organizationId: email.organizationId,
        deletedAt: null,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        organization: { is: { isActive: true } },
      },
      select: {
        protocol: true,
        firstResponseAt: true,
        firstResponseDueAt: true,
        resolutionDueAt: true,
        assigneeMembership: {
          select: {
            isActive: true,
            user: { select: { isActive: true, email: true } },
          },
        },
      },
    })
  );
  const assignee = ticket?.assigneeMembership;
  if (!ticket || !assignee?.isActive || !assignee.user.isActive)
    return false;
  if (assignee.user.email !== email.recipient) return false;

  const candidateDueDates = [
    ticket.firstResponseAt === null ? ticket.firstResponseDueAt : null,
    ticket.resolutionDueAt,
  ].filter(
    (due): due is Date =>
      due !== null &&
      due.getTime() > now.getTime() &&
      due.getTime() <= now.getTime() + ALERT_WINDOW_MS
  );
  if (candidateDueDates.length === 0) return false;
  const dueAt = candidateDueDates.reduce((a, b) => (a <= b ? a : b));

  // The immutable queue identity includes the deadline. If another deadline
  // became the next actionable one, old notifications must not go out.
  try {
    const current = composeSlaDueEmail({
      organizationId: email.organizationId,
      ticketId: email.referenceId,
      recipient: assignee.user.email,
      protocol: ticket.protocol,
      dueAt,
      minutesRemaining: Math.ceil(
        (dueAt.getTime() - now.getTime()) / 60000
      ),
    });
    return (
      email.idempotencyKey === current.idempotencyKey &&
      email.subject === current.subject
    );
  } catch {
    return false;
  }
}

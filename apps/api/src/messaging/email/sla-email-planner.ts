import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { composeSlaDueEmail } from "./email-composer";
import { enqueueTransactionalEmail } from "./email-outbox";

export const SLA_EMAIL_ALERT_WINDOW_MINUTES = 30;
const PAGE_SIZE = 100;
const MAX_ENQUEUED_PER_CYCLE = 100;

/**
 * F4.3-02B1: deterministic post-commit planning for operational SLA alerts.
 *
 * Planning is invoked explicitly; it does not run on application startup.
 * This reads only the current tenant's tickets and active assigned members,
 * then inserts into the encrypted email outbox within a single transaction.
 * SMTP/network I/O is never performed here.
 */
@Injectable()
export class SlaEmailPlanner {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async enqueueDueAlerts(
    organizationId: string,
    now: Date = new Date()
  ): Promise<number> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
      throw new Error("INVALID_SLA_EMAIL_CLOCK");

    const through = new Date(
      now.getTime() + SLA_EMAIL_ALERT_WINDOW_MINUTES * 60000
    );

    return this.prisma.withTenant(organizationId, async tenant => {
      let enqueued = 0;
      let cursor: string | undefined;
      for (;;) {
        const tickets = await tenant.ticket.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ["OPEN", "IN_PROGRESS"] },
          assigneeMembership: {
            is: { isActive: true, user: { isActive: true } },
          },
          OR: [
            {
              firstResponseAt: null,
              firstResponseDueAt: { gt: now, lte: through },
            },
            { resolutionDueAt: { gt: now, lte: through } },
          ],
        },
        include: {
          assigneeMembership: {
            include: { user: { select: { email: true, isActive: true } } },
          },
        },
        orderBy: [{ openedAt: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const ticket of tickets) {
        const assignee = ticket.assigneeMembership;
        if (!assignee?.isActive || !assignee.user.isActive) continue;

        const candidates = [
          ticket.firstResponseAt === null
            ? ticket.firstResponseDueAt
            : null,
          ticket.resolutionDueAt,
        ].filter(
          (due): due is Date =>
            due !== null &&
            due.getTime() > now.getTime() &&
            due.getTime() <= through.getTime()
        );
        if (candidates.length === 0) continue;

        const dueAt = candidates.reduce((a, b) => (a <= b ? a : b));
        let message;
        try {
          message = composeSlaDueEmail({
            organizationId,
            ticketId: ticket.id,
            recipient: assignee.user.email,
            protocol: ticket.protocol,
            dueAt,
            minutesRemaining: Math.ceil(
              (dueAt.getTime() - now.getTime()) / 60000
            ),
          });
        } catch {
          // Do not queue alerts with invalid or potentially injectable
          // account email/protocol data. Never log recipient addresses.
          continue;
        }

          if (await enqueueTransactionalEmail(tenant, message)) {
            enqueued += 1;
            if (enqueued >= MAX_ENQUEUED_PER_CYCLE) return enqueued;
          }
        }
        if (tickets.length < PAGE_SIZE) break;
        cursor = tickets[tickets.length - 1]!.id;
      }
      return enqueued;
    }, { timeout: 30000 });
  }
}

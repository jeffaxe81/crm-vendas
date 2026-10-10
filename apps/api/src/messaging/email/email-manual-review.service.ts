import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";

export type EmailReviewContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
}>;

export type EmailReviewResolution = Readonly<{
  decision: "CONFIRMED_ACCEPTED" | "CONFIRMED_NOT_ACCEPTED";
  evidenceReference: string;
  providerMessageId?: string;
}>;

/**
 * Operator-only reconciliation. Does not decrypt messages, contact the
 * provider, schedule work, or allow an ambiguous event to be retried.
 * Every decision is an atomic tenant-scoped status change and audit entry.
 */
@Injectable()
export class EmailManualReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertAdministrator(
    tx: Prisma.TransactionClient,
    context: EmailReviewContext
  ) {
    const membership = await tx.organizationMembership.findFirst({
      where: {
        organizationId: context.organizationId,
        userId: context.actorUserId,
        isActive: true,
        user: { isActive: true },
        organization: { isActive: true },
        OR: [{ role: "ADMIN" }, { isSuperuser: true }],
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: "EMAIL_REVIEW_ADMIN_REQUIRED",
        message: "A reconciliação de e-mail exige administrador ativo.",
      });
    }
  }

  async list(context: EmailReviewContext, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("INVALID_EMAIL_REVIEW_LIMIT");
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdministrator(tx, context);
      return tx.emailOutbox.findMany({
        where: {
          organizationId: context.organizationId,
          status: "MANUAL_REVIEW",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit,
        // No encrypted body, raw recipient, or plaintext message is returned.
        select: {
          id: true,
          ticketId: true,
          idempotencyHash: true,
          purpose: true,
          attemptCount: true,
          lastErrorCode: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  async resolve(
    id: string,
    resolution: EmailReviewResolution,
    context: EmailReviewContext
  ) {
    // Restrict proof to an opaque relay ticket/receipt reference; never persist
    // mailbox text, access tokens or secret provider payloads in audit metadata.
    if (
      !/^[A-Za-z0-9._:/#-]{8,180}$/.test(resolution.evidenceReference) ||
      !/^[0-9a-fA-F-]{36}$/.test(id) ||
      !/^[\x20-\x7e]{1,120}$/.test(context.requestId)
    ) {
      throw new Error("INVALID_EMAIL_REVIEW_INPUT");
    }
    const accepted = resolution.decision === "CONFIRMED_ACCEPTED";
    if (
      !["CONFIRMED_ACCEPTED", "CONFIRMED_NOT_ACCEPTED"].includes(
        resolution.decision
      ) ||
      (accepted &&
        (typeof resolution.providerMessageId !== "string" ||
          !/^[A-Za-z0-9._:-]{1,200}$/.test(resolution.providerMessageId))) ||
      (!accepted && resolution.providerMessageId !== undefined)
    ) {
      throw new Error("INVALID_EMAIL_REVIEW_DECISION");
    }
    const status = accepted ? "ACCEPTED" : "CANCELLED";
    const errorCode = accepted ? null : "MANUAL_CONFIRMED_NOT_ACCEPTED";

    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdministrator(tx, context);
      const previous = await tx.emailOutbox.findFirst({
        where: { id, organizationId: context.organizationId },
        select: {
          id: true,
          status: true,
          attemptCount: true,
          lastErrorCode: true,
        },
      });
      if (!previous) {
        throw new NotFoundException({ code: "EMAIL_REVIEW_NOT_FOUND" });
      }
      if (previous.status !== "MANUAL_REVIEW") {
        throw new ConflictException({ code: "EMAIL_REVIEW_ALREADY_RESOLVED" });
      }
      const changed = await tx.emailOutbox.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          status: "MANUAL_REVIEW",
        },
        data: {
          status,
          nextAttemptAt: null,
          leaseToken: null,
          leasedUntil: null,
          providerMessageId: accepted ? resolution.providerMessageId! : null,
          lastErrorCode: errorCode,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException({ code: "EMAIL_REVIEW_CONCURRENT_CHANGE" });
      }
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          action: "email.manual_review.resolve",
          entityType: "EmailOutbox",
          entityId: id,
          before: {
            status: previous.status,
            lastErrorCode: previous.lastErrorCode,
            attemptCount: previous.attemptCount,
          },
          after: { status, lastErrorCode: errorCode },
          metadata: {
            decision: resolution.decision,
            evidenceReference: resolution.evidenceReference,
            // Relay message ID is an operational receipt, not proof of delivery.
            providerMessageId: accepted ? resolution.providerMessageId! : null,
          },
        },
      });
      return { id, status };
    });
  }
}

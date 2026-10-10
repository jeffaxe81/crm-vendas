import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import type { EmailRelaySettingsContext } from "./email-relay-settings.service";

export const EMAIL_RELAY_EVIDENCE_TYPES = [
  "DURABLE_IDEMPOTENCY",
  "EGRESS_POLICY",
  "TLS_DNS_POLICY",
  "OPERATIONAL_REVIEW",
] as const;

export type EmailRelayEvidenceType =
  (typeof EMAIL_RELAY_EVIDENCE_TYPES)[number];

export type EmailRelayEvidenceInput = Readonly<{
  type: EmailRelayEvidenceType;
  reference: string;
}>;

const ACTION = "email.relay_evidence.recorded";

@Injectable()
export class EmailRelayEvidenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertAdministrator(
    tx: Prisma.TransactionClient,
    context: EmailRelaySettingsContext
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
      throw new ForbiddenException({ code: "EMAIL_EVIDENCE_ADMIN_REQUIRED" });
    }
  }

  async list(context: EmailRelaySettingsContext) {
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdministrator(tx, context);
      const records = await tx.auditLog.findMany({
        where: { organizationId: context.organizationId, action: ACTION },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          actorUserId: true,
          createdAt: true,
          metadata: true,
        },
      });
      // An allowlisted projection, never raw metadata or audit payloads.
      return records.map(row => {
        const metadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        const type = EMAIL_RELAY_EVIDENCE_TYPES.find(
          candidate => candidate === metadata.type
        );
        return {
          id: row.id,
          actorUserId: row.actorUserId,
          createdAt: row.createdAt.toISOString(),
          type: type ?? "OPERATIONAL_REVIEW",
          reference:
            typeof metadata.reference === "string" &&
            /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/.test(metadata.reference)
              ? metadata.reference
              : "REDACTED",
          verification: "SUBMITTED_UNVERIFIED" as const,
        };
      });
    });
  }

  async record(
    input: EmailRelayEvidenceInput,
    context: EmailRelaySettingsContext
  ) {
    if (
      !EMAIL_RELAY_EVIDENCE_TYPES.includes(input.type) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/.test(input.reference) ||
      !/^[\x20-\x7e]{1,120}$/.test(context.requestId)
    ) {
      throw new BadRequestException({ code: "EMAIL_EVIDENCE_INVALID_INPUT" });
    }
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdministrator(tx, context);
      const row = await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          action: ACTION,
          entityType: "EmailRelaySettings",
          entityId: context.organizationId,
          metadata: {
            type: input.type,
            reference: input.reference,
            verification: "SUBMITTED_UNVERIFIED",
          },
        },
        select: { id: true, actorUserId: true, createdAt: true },
      });
      return {
        id: row.id,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt.toISOString(),
        type: input.type,
        reference: input.reference,
        verification: "SUBMITTED_UNVERIFIED" as const,
      };
    });
  }
}

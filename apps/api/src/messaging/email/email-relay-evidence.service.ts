import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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
const REVIEW_ACTION = "email.relay_evidence.reviewed";

export type EmailRelayEvidenceReviewInput = Readonly<{
  evidenceId: string;
  decision: "CHECKED" | "REJECTED";
}>;

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
      const reviews = records.length
        ? await tx.auditLog.findMany({
            where: {
              organizationId: context.organizationId,
              action: REVIEW_ACTION,
              OR: records.map(row => ({
                metadata: { path: ["evidenceId"], equals: row.id },
              })),
            },
            select: {
              actorUserId: true,
              createdAt: true,
              metadata: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : [];
      const reviewedByEvidence = new Map<
        string,
        (typeof reviews)[number]
      >();
      for (const review of reviews) {
        const data =
          review.metadata &&
          typeof review.metadata === "object" &&
          !Array.isArray(review.metadata)
            ? (review.metadata as Record<string, unknown>)
            : {};
        if (
          typeof data.evidenceId === "string" &&
          !reviewedByEvidence.has(data.evidenceId)
        ) {
          reviewedByEvidence.set(data.evidenceId, review);
        }
      }
      const settings = await tx.emailRelaySettings.findFirst({
        where: { organizationId: context.organizationId },
        select: { version: true },
      });
      const currentVersion = settings?.version ?? 0;
      // An allowlisted projection, never raw metadata or audit payloads.
      return records.map(row => {
        const metadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        const type = EMAIL_RELAY_EVIDENCE_TYPES.find(
          candidate => candidate === metadata.type
        );
        const reviewRow = reviewedByEvidence.get(row.id);
        const reviewData =
          reviewRow?.metadata &&
          typeof reviewRow.metadata === "object" &&
          !Array.isArray(reviewRow.metadata)
            ? (reviewRow.metadata as Record<string, unknown>)
            : {};
        const decision =
          reviewData.decision === "CHECKED" ||
          reviewData.decision === "REJECTED"
            ? reviewData.decision
            : null;
        const reviewedVersion =
          typeof reviewData.settingsVersion === "number" &&
          Number.isSafeInteger(reviewData.settingsVersion)
            ? reviewData.settingsVersion
            : null;
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
          settingsVersion:
            typeof metadata.settingsVersion === "number" &&
            Number.isSafeInteger(metadata.settingsVersion)
              ? metadata.settingsVersion
              : null,
          ...(reviewRow && decision && reviewedVersion !== null
            ? {
                review: {
                  decision,
                  reviewerUserId: reviewRow.actorUserId,
                  reviewedAt: reviewRow.createdAt.toISOString(),
                  settingsVersion: reviewedVersion,
                  currentConfiguration: reviewedVersion === currentVersion,
                  verification: "REVIEWED_NOT_CERTIFIED" as const,
                },
              }
            : {}),
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
      const settings = await tx.emailRelaySettings.findFirst({
        where: { organizationId: context.organizationId },
        select: { version: true },
      });
      const settingsVersion = settings?.version ?? 0;
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
            settingsVersion,
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
        settingsVersion,
      };
    });
  }

  /**
   * Second-person review of an opaque evidence reference; never certifies
   * remote security controls or enables email. A locked source audit row
   * serializes competing reviewers before the duplicate check.
   */
  async review(
    input: EmailRelayEvidenceReviewInput,
    context: EmailRelaySettingsContext
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.evidenceId
      ) ||
      !["CHECKED", "REJECTED"].includes(input.decision)
    ) {
      throw new BadRequestException({ code: "EMAIL_EVIDENCE_REVIEW_INVALID" });
    }

    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdministrator(tx, context);
      // Do not unlock this row before writing the review audit event.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM audit_logs
        WHERE organization_id = ${context.organizationId}::uuid
          AND id = ${input.evidenceId}::uuid
          AND action = ${ACTION}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new NotFoundException({ code: "EMAIL_EVIDENCE_NOT_FOUND" });
      }
      const evidence = await tx.auditLog.findFirstOrThrow({
        where: {
          organizationId: context.organizationId,
          id: input.evidenceId,
          action: ACTION,
        },
        select: { actorUserId: true, metadata: true },
      });
      if (!evidence.actorUserId || evidence.actorUserId === context.actorUserId) {
        throw new ForbiddenException({
          code: "EMAIL_EVIDENCE_INDEPENDENT_REVIEW_REQUIRED",
        });
      }
      const metadata =
        evidence.metadata &&
        typeof evidence.metadata === "object" &&
        !Array.isArray(evidence.metadata)
          ? (evidence.metadata as Record<string, unknown>)
          : {};
      const submissionVersion = metadata.settingsVersion;
      const settings = await tx.emailRelaySettings.findFirst({
        where: { organizationId: context.organizationId },
        select: { version: true },
      });
      const currentVersion = settings?.version ?? 0;
      if (
        typeof submissionVersion !== "number" ||
        !Number.isSafeInteger(submissionVersion) ||
        submissionVersion !== currentVersion
      ) {
        throw new ConflictException({
          code: "EMAIL_EVIDENCE_CONFIGURATION_CHANGED",
        });
      }
      const existing = await tx.auditLog.findFirst({
        where: {
          organizationId: context.organizationId,
          action: REVIEW_ACTION,
          metadata: { path: ["evidenceId"], equals: input.evidenceId },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({ code: "EMAIL_EVIDENCE_ALREADY_REVIEWED" });
      }
      const review = await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          action: REVIEW_ACTION,
          entityType: "EmailRelayEvidence",
          entityId: input.evidenceId,
          metadata: {
            evidenceId: input.evidenceId,
            decision: input.decision,
            settingsVersion: currentVersion,
            verification: "REVIEWED_NOT_CERTIFIED",
          },
        },
        select: { id: true, actorUserId: true, createdAt: true },
      });
      return {
        id: review.id,
        evidenceId: input.evidenceId,
        decision: input.decision,
        reviewerUserId: review.actorUserId,
        reviewedAt: review.createdAt.toISOString(),
        settingsVersion: currentVersion,
        verification: "REVIEWED_NOT_CERTIFIED" as const,
        sendingEnabled: false as const,
        activationEligible: false as const,
      };
    });
  }
}

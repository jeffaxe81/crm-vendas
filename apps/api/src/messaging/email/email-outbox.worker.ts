import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { decryptOutboxEmail, emailOutboxKey } from "./email-outbox-crypto";
import { isSlaEmailStillCurrent } from "./sla-email-dispatch-guard";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 30000;
const BASE_BACKOFF_MS = 30000;

/**
 * Explicitly invoked only; no timer or outbound provider is enabled by this
 * microdelivery. Provider dispatch occurs strictly outside DB transactions.
 */
@Injectable()
export class EmailOutboxWorker {
  private running = false;
  private readonly logger = new Logger(EmailOutboxWorker.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailDispatchService)
    private readonly dispatch: EmailDispatchService
  ) {}

  async processNext(organizationId: string, now: Date = new Date()) {
    let key: string;
    try {
      key = emailOutboxKey(process.env.EMAIL_OUTBOX_ENCRYPTION_KEY);
    } catch {
      return false;
    }
    const claimed = await this.prisma.withTenant(organizationId, async tx => {
      const [candidate] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM email_outbox
        WHERE organization_id = ${organizationId}::uuid
          AND (
            (status IN ('PENDING', 'RETRY_SCHEDULED') AND next_attempt_at <= ${now})
            OR (status = 'PROCESSING' AND leased_until <= ${now})
          )
        ORDER BY COALESCE(next_attempt_at, leased_until), created_at, id
        LIMIT 1 FOR UPDATE SKIP LOCKED
      `;
      if (!candidate) return null;
      const row = await tx.emailOutbox.findFirstOrThrow({
        where: { id: candidate.id, organizationId },
      });
      // An expired lease may have been lost after remote acceptance.
      // Never resubmit it automatically without verified relay deduplication.
      if (row.status === "PROCESSING") {
        await tx.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: "MANUAL_REVIEW",
            nextAttemptAt: null,
            leaseToken: null,
            leasedUntil: null,
            lastErrorCode: "LEASE_EXPIRED_UNKNOWN",
          },
        });
        return { kind: "FINAL" as const };
      }
      if (row.attemptCount >= MAX_ATTEMPTS) {
        await tx.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: "EXHAUSTED",
            nextAttemptAt: null,
            leaseToken: null,
            leasedUntil: null,
            lastErrorCode: "LEASE_EXPIRED",
          },
        });
        return { kind: "FINAL" as const };
      }
      const updated = await tx.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: "PROCESSING",
          attemptCount: { increment: 1 },
          nextAttemptAt: null,
          leaseToken: randomUUID(),
          leasedUntil: new Date(now.getTime() + LEASE_MS),
        },
      });
      return { kind: "CLAIM" as const, row: updated };
    });
    if (!claimed) return false;
    if (claimed.kind === "FINAL") return true;

    const row = claimed.row;
    let outcome: Awaited<ReturnType<EmailDispatchService["attempt"]>>;
    let staleAlert = false;
    try {
      const email = decryptOutboxEmail(
        row.encryptedEmail,
        key,
        organizationId,
        row.ticketId,
        row.idempotencyHash
      );
      if (await isSlaEmailStillCurrent(this.prisma, email, now)) {
        outcome = await this.dispatch.attempt(email);
      } else {
        staleAlert = true;
        outcome = { status: "FAILED", errorCode: "PROVIDER_ERROR" };
      }
    } catch {
      outcome = { status: "FAILED", errorCode: "PROVIDER_ERROR" };
    }

    const accepted = outcome.status === "ACCEPTED";
    const exhausted = !accepted && row.attemptCount >= MAX_ATTEMPTS;
    const unknown =
      outcome.status === "FAILED" && outcome.errorCode === "DELIVERY_UNKNOWN";
    const status = staleAlert
      ? "CANCELLED"
      : unknown
        ? "MANUAL_REVIEW"
        : accepted
        ? "ACCEPTED"
        : exhausted
          ? "EXHAUSTED"
          : "RETRY_SCHEDULED";
    const retryAt =
      !accepted && !exhausted && !staleAlert && !unknown
        ? new Date(
            now.getTime() + BASE_BACKOFF_MS * 2 ** (row.attemptCount - 1)
          )
        : null;
    await this.prisma.withTenant(organizationId, async tx => {
      // A late worker cannot rewrite another process's recovered lease.
      await tx.emailOutbox.updateMany({
        where: {
          id: row.id,
          organizationId,
          status: "PROCESSING",
          leaseToken: row.leaseToken,
        },
        data: {
          status,
          nextAttemptAt: retryAt,
          leaseToken: null,
          leasedUntil: null,
          providerMessageId:
            outcome.status === "ACCEPTED"
              ? outcome.providerMessageId.slice(0, 200)
              : null,
          lastErrorCode: staleAlert
            ? "STALE_OR_UNAUTHORIZED_ALERT"
            : outcome.status === "FAILED"
              ? outcome.errorCode
              : null,
        },
      });
    });
    return true;
  }

  async runCycle(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const batch = await this.prisma.organization.findMany({
          where: { isActive: true },
          select: { id: true },
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const organization of batch) {
          try {
            await this.processNext(organization.id, now);
          } catch {
            this.logger.error("Email queue tenant cycle failed");
          }
        }
        if (batch.length < 100) break;
        cursor = batch.at(-1)!.id;
      }
    } finally {
      this.running = false;
    }
  }
}

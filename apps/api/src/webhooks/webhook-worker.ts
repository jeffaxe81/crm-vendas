import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { Prisma, WebhookDispatch } from "../generated/prisma/client";
import { nextWebhookDeliveryState } from "./webhook-delivery-policy";
import { decryptWebhookSecret, webhookEncryptionKey } from "./webhook-secret";
import { signWebhookPayload } from "./webhook-security";
import {
  WEBHOOK_TRANSPORT,
  type WebhookTransport,
  type WebhookTransportResult,
} from "./webhook-transport";
const MAX_ATTEMPTS = 5;
const LEASE_MS = 30_000;
@Injectable()
export class WebhookWorker {
  private running = false;
  private readonly logger = new Logger(WebhookWorker.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WEBHOOK_TRANSPORT) private readonly transport: WebhookTransport
  ) {}

  async processNext(organizationId: string, now?: Date): Promise<boolean> {
    const fixedClock = now !== undefined;
    now ??= new Date();
    const key = process.env.WEBHOOK_ENCRYPTION_KEY;
    try {
      webhookEncryptionKey(key);
    } catch {
      return false;
    }
    const claimed = await this.prisma.withTenant(
      organizationId,
      async tenant => {
        const [candidate] = await tenant.$queryRaw<{ id: string }[]>`
        SELECT id FROM webhook_dispatches
        WHERE organization_id = ${organizationId}::uuid
          AND ((status IN ('PENDING','RETRY_SCHEDULED') AND next_attempt_at <= ${now})
            OR (status = 'PROCESSING' AND locked_until <= ${now}))
        ORDER BY COALESCE(next_attempt_at, locked_until), created_at, id
        LIMIT 1 FOR UPDATE SKIP LOCKED
      `;
        if (!candidate) return null;
        const dispatch = await tenant.webhookDispatch.findFirstOrThrow({
          where: { id: candidate.id, organizationId },
        });
        if (dispatch.status === "PROCESSING") {
          await this.appendAttempt(
            tenant,
            dispatch,
            { responseStatus: null, errorCode: "LEASE_EXPIRED" },
            now
          );
          if (dispatch.attemptCount >= MAX_ATTEMPTS) {
            await tenant.webhookDispatch.update({
              where: { id: dispatch.id },
              data: {
                status: "EXHAUSTED",
                nextAttemptAt: null,
                lockedUntil: null,
                leaseToken: null,
                lastErrorCode: "LEASE_EXPIRED",
              },
            });
            await this.auditExhaustion(tenant, dispatch, "LEASE_EXPIRED");
            return { dispatch: null };
          }
        }
        if (!(await this.isCurrent(tenant, dispatch))) {
          await this.cancel(tenant, dispatch.id, organizationId);
          return { dispatch: null };
        }
        const updated = await tenant.webhookDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: "PROCESSING",
            attemptCount: dispatch.attemptCount + 1,
            leaseToken: randomUUID(),
            lockedUntil: new Date(now.getTime() + LEASE_MS),
            nextAttemptAt: null,
          },
        });
        return { dispatch: updated };
      }
    );
    if (!claimed) return false;
    if (!claimed.dispatch) return true;
    const dispatch = claimed.dispatch;
    // Re-read after claim commit. Management edits also invalidate pending leases.
    const current = await this.prisma.withTenant(
      organizationId,
      async tenant => {
        const row = await tenant.webhookDispatch.findFirst({
          where: {
            id: dispatch.id,
            organizationId,
            status: "PROCESSING",
            leaseToken: dispatch.leaseToken,
          },
        });
        if (!row) return false;
        if (!(await this.isCurrent(tenant, row))) {
          await this.cancel(tenant, row.id, organizationId);
          return false;
        }
        return true;
      }
    );
    if (!current) return true;
    let result: WebhookTransportResult;
    try {
      const secret = decryptWebhookSecret(
        dispatch.encryptedSecret,
        key!,
        `${organizationId}:${dispatch.subscriptionId}`
      );
      const body = JSON.stringify(dispatch.payload);
      result = await this.transport.send(dispatch.targetUrl, body, {
        "Content-Type": "application/json",
        "X-Axes-Event-Id": dispatch.eventId,
        "X-Axes-Event-Type": dispatch.eventType,
        "X-Axes-Signature": signWebhookPayload(body, secret),
        "X-Axes-Attempt": String(dispatch.attemptCount),
      });
    } catch {
      result = { responseStatus: null, errorCode: "DELIVERY_FAILED" };
    }
    const completedAt = fixedClock ? now : new Date();
    await this.prisma.withTenant(organizationId, async tenant => {
      const success =
        result.responseStatus !== null &&
        result.responseStatus >= 200 &&
        result.responseStatus <= 299 &&
        !result.errorCode;
      const state = nextWebhookDeliveryState(
        {
          status: "PENDING",
          attemptCount: dispatch.attemptCount - 1,
          maxAttempts: MAX_ATTEMPTS,
          nextAttemptAt: null,
        },
        {
          outcome: success ? "DELIVERED" : "FAILED",
          now: completedAt,
          baseDelayMs: 30_000,
        }
      );
      const errorCode = success ? null : (result.errorCode ?? "HTTP_STATUS");
      const updated = await tenant.webhookDispatch.updateMany({
        where: {
          id: dispatch.id,
          organizationId,
          status: "PROCESSING",
          leaseToken: dispatch.leaseToken,
        },
        data: {
          status: state.status,
          nextAttemptAt: state.nextAttemptAt,
          leaseToken: null,
          lockedUntil: null,
          lastErrorCode: errorCode,
        },
      });
      if (updated.count !== 1) return;
      await this.appendAttempt(
        tenant,
        dispatch,
        { responseStatus: result.responseStatus, errorCode },
        completedAt
      );
      if (state.status === "EXHAUSTED")
        await this.auditExhaustion(tenant, dispatch, errorCode!);
    });
    return true;
  }

  async runCycle(now?: Date): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const organizations = await this.prisma.organization.findMany({
          where: { isActive: true },
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true },
        });
        for (const organization of organizations) {
          try {
            await this.processNext(organization.id, now);
          } catch {
            this.logger.error("Webhook worker tenant cycle failed");
          }
        }
        if (organizations.length < 100) break;
        cursor = organizations.at(-1)!.id;
      }
    } finally {
      this.running = false;
    }
  }
  private async isCurrent(
    tenant: Prisma.TransactionClient,
    dispatch: WebhookDispatch
  ): Promise<boolean> {
    const subscription = await tenant.webhookSubscription.findFirst({
      where: {
        id: dispatch.subscriptionId,
        organizationId: dispatch.organizationId,
      },
    });
    return Boolean(
      subscription?.isActive &&
      subscription.targetUrl === dispatch.targetUrl &&
      subscription.encryptedSecret === dispatch.encryptedSecret &&
      (dispatch.eventType === "webhook.test" ||
        subscription.eventTypes.includes(dispatch.eventType))
    );
  }
  private async cancel(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ): Promise<void> {
    await tenant.webhookDispatch.updateMany({
      where: {
        id,
        organizationId,
        status: { in: ["PENDING", "RETRY_SCHEDULED", "PROCESSING"] },
      },
      data: {
        status: "CANCELLED",
        nextAttemptAt: null,
        lockedUntil: null,
        leaseToken: null,
        lastErrorCode: "SUBSCRIPTION_CHANGED",
      },
    });
  }
  private async appendAttempt(
    tenant: Prisma.TransactionClient,
    dispatch: WebhookDispatch,
    result: WebhookTransportResult,
    createdAt: Date
  ): Promise<void> {
    await tenant.webhookDelivery.create({
      data: {
        organizationId: dispatch.organizationId,
        subscriptionId: dispatch.subscriptionId,
        dispatchId: dispatch.id,
        attempt: dispatch.attemptCount,
        status: result.errorCode ? "FAILED" : "DELIVERED",
        responseStatus: result.responseStatus,
        errorCode: result.errorCode,
        createdAt,
      },
    });
  }
  private async auditExhaustion(
    tenant: Prisma.TransactionClient,
    dispatch: WebhookDispatch,
    errorCode: string
  ): Promise<void> {
    await tenant.auditLog.create({
      data: {
        organizationId: dispatch.organizationId,
        actorUserId: null,
        requestId: dispatch.requestId,
        action: "integration.webhook.exhausted",
        entityType: "webhook_dispatch",
        entityId: dispatch.id,
        metadata: {
          actorType: "SYSTEM",
          actorId: "webhook-worker",
          attemptCount: dispatch.attemptCount,
          errorCode,
        },
      },
    });
  }
}

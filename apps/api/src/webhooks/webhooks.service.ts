import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  WebhookDispatchSummarySchema,
  WebhookSubscriptionSummarySchema,
  type WebhookDispatchSummary,
  type WebhookSubscriptionCreateInput,
  type WebhookSubscriptionCreated,
  type WebhookSubscriptionSummary,
  type WebhookSubscriptionUpdateInput,
} from "@axes/contracts";
import { PrismaService } from "../database/prisma.service";
import type {
  Prisma,
  WebhookDispatch,
  WebhookDelivery,
  WebhookSubscription,
} from "../generated/prisma/client";
import { assertSafeWebhookTargetUrl } from "./webhook-security";
import { encryptWebhookSecret, webhookEncryptionKey } from "./webhook-secret";
import { lockWebhookTransaction } from "./webhook-connection-lock";

export type WebhookManagementContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};
const subscriptionSelect = {
  id: true,
  name: true,
  targetUrl: true,
  eventTypes: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WebhookSubscriptionSelect;
const deliverySelect = {
  id: true,
  attempt: true,
  status: true,
  responseStatus: true,
  errorCode: true,
  createdAt: true,
} satisfies Prisma.WebhookDeliverySelect;
export const webhookDispatchSummarySelect = {
  id: true,
  subscriptionId: true,
  eventId: true,
  eventType: true,
  status: true,
  attemptCount: true,
  nextAttemptAt: true,
  lastErrorCode: true,
  createdAt: true,
  updatedAt: true,
  deliveries: { orderBy: { attempt: "asc" }, select: deliverySelect },
} satisfies Prisma.WebhookDispatchSelect;
type SubscriptionSummaryRow = Pick<
  WebhookSubscription,
  keyof typeof subscriptionSelect
>;
type DispatchSummaryRow = Pick<
  WebhookDispatch,
  | "id"
  | "subscriptionId"
  | "eventId"
  | "eventType"
  | "status"
  | "attemptCount"
  | "nextAttemptAt"
  | "lastErrorCode"
  | "createdAt"
  | "updatedAt"
> & { deliveries: Pick<WebhookDelivery, keyof typeof deliverySelect>[] };
export function toWebhookDispatchSummary(
  row: DispatchSummaryRow
): WebhookDispatchSummary {
  return WebhookDispatchSummarySchema.parse({
    id: row.id,
    subscriptionId: row.subscriptionId,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deliveries: row.deliveries.map(delivery => ({
      id: delivery.id,
      attempt: delivery.attempt,
      status: delivery.status,
      responseStatus: delivery.responseStatus,
      errorCode: delivery.errorCode,
      createdAt: delivery.createdAt.toISOString(),
    })),
  });
}
@Injectable()
export class WebhooksService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async test(
    id: string,
    context: WebhookManagementContext
  ): Promise<WebhookDispatchSummary> {
    try {
      webhookEncryptionKey(process.env.WEBHOOK_ENCRYPTION_KEY);
    } catch {
      throw new ServiceUnavailableException({
        code: "WEBHOOK_ENCRYPTION_UNAVAILABLE",
        message: "Criptografia de webhooks indisponível.",
      });
    }
    return this.prisma.withTenant(context.organizationId, async tenant => {
      const subscription = await tenant.webhookSubscription.findFirst({
        where: { id, organizationId: context.organizationId },
      });
      if (!subscription) throw this.notFound();
      if (!subscription.isActive)
        throw new BadRequestException({
          code: "WEBHOOK_SUBSCRIPTION_INACTIVE",
          message: "Assinatura inativa.",
        });
      this.validateTarget(subscription.targetUrl);
      const eventId = randomUUID();
      const occurredAt = new Date();
      const row = await tenant.webhookDispatch.create({
        data: {
          organizationId: context.organizationId,
          subscriptionId: id,
          subscriptionVersion: subscription.version,
          eventId,
          eventType: "webhook.test",
          payload: {
            id: eventId,
            type: "webhook.test",
            version: 1,
            occurredAt: occurredAt.toISOString(),
            organizationId: context.organizationId,
            data: { entityId: id, version: subscription.version },
          },
          targetUrl: subscription.targetUrl,
          encryptedSecret: subscription.encryptedSecret,
          requestId: context.requestId,
          nextAttemptAt: occurredAt,
        },
        select: webhookDispatchSummarySelect,
      });
      await this.audit(
        tenant,
        context,
        id,
        "integration.webhook.test_requested",
        subscription
      );
      return toWebhookDispatchSummary(row);
    });
  }

  async list(organizationId: string): Promise<WebhookSubscriptionSummary[]> {
    return this.prisma.withTenant(organizationId, async tenant => {
      const rows = await tenant.webhookSubscription.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: subscriptionSelect,
      });
      return rows.map(row => this.summary(row));
    });
  }
  async create(
    input: WebhookSubscriptionCreateInput,
    context: WebhookManagementContext
  ): Promise<WebhookSubscriptionCreated> {
    const key = process.env.WEBHOOK_ENCRYPTION_KEY;
    try {
      webhookEncryptionKey(key);
    } catch {
      throw new ServiceUnavailableException({
        code: "WEBHOOK_ENCRYPTION_UNAVAILABLE",
        message: "Criptografia de webhooks indisponível.",
      });
    }
    this.validateTarget(input.targetUrl);
    const id = randomUUID();
    const plainSecret = `whsec_${randomBytes(32).toString("base64url")}`;
    const encryptedSecret = encryptWebhookSecret(
      plainSecret,
      key!,
      `${context.organizationId}:${id}`
    );
    return this.prisma.withTenant(context.organizationId, async tenant => {
      const row = await tenant.webhookSubscription.create({
        data: {
          id,
          organizationId: context.organizationId,
          ...input,
          encryptedSecret,
          createdBy: context.actorUserId,
        },
        select: subscriptionSelect,
      });
      await this.audit(
        tenant,
        context,
        row.id,
        "integration.webhook.created",
        row
      );
      return { ...this.summary(row), plainSecret };
    });
  }
  async update(
    id: string,
    input: WebhookSubscriptionUpdateInput,
    context: WebhookManagementContext
  ): Promise<WebhookSubscriptionSummary> {
    if (input.targetUrl !== undefined) this.validateTarget(input.targetUrl);
    return this.prisma.withTenant(context.organizationId, async tenant => {
      await lockWebhookTransaction(tenant, context.organizationId);
      const previous = await tenant.webhookSubscription.findFirst({
        where: { id, organizationId: context.organizationId },
        select: subscriptionSelect,
      });
      if (!previous) throw this.notFound();
      const { version, ...changes } = input;
      const updated = await tenant.webhookSubscription.updateMany({
        where: { id, organizationId: context.organizationId, version },
        data: { ...changes, version: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException({
          code: "WEBHOOK_VERSION_CONFLICT",
          message: "Assinatura alterada. Atualize e tente novamente.",
        });
      const destinationChanged =
        input.targetUrl !== undefined && input.targetUrl !== previous.targetUrl;
      const deactivated = input.isActive === false && previous.isActive;
      const nextEvents = new Set<string>(
        input.eventTypes ?? previous.eventTypes
      );
      const removedEvents = previous.eventTypes.filter(
        event => !nextEvents.has(event)
      );
      if (destinationChanged || deactivated || removedEvents.length) {
        const affected = {
          organizationId: context.organizationId,
          subscriptionId: id,
          status: { in: ["PENDING", "RETRY_SCHEDULED", "PROCESSING"] },
          ...(!destinationChanged && !deactivated
            ? { eventType: { in: removedEvents } }
            : {}),
        };
        await tenant.webhookDispatch.updateMany({
          where: { ...affected, requestStartedAt: null },
          data: {
            status: "CANCELLED",
            nextAttemptAt: null,
            lockedUntil: null,
            leaseToken: null,
            lastErrorCode: "SUBSCRIPTION_CHANGED",
          },
        });
        // A started attempt owns its result even after cancellation. Keep its
        // lease until completion/recovery; CANCELLED forbids obsolete retries.
        await tenant.webhookDispatch.updateMany({
          where: { ...affected, requestStartedAt: { not: null } },
          data: {
            status: "CANCELLED",
            nextAttemptAt: null,
            lastErrorCode: "SUBSCRIPTION_CHANGED",
          },
        });
      }
      const row = await tenant.webhookSubscription.findFirst({
        where: { id, organizationId: context.organizationId },
        select: subscriptionSelect,
      });
      if (!row) throw this.notFound();
      await this.audit(tenant, context, id, "integration.webhook.updated", row);
      return this.summary(row);
    });
  }
  async history(
    id: string,
    organizationId: string
  ): Promise<WebhookDispatchSummary[]> {
    return this.prisma.withTenant(organizationId, async tenant => {
      if (
        !(await tenant.webhookSubscription.findFirst({
          where: { id, organizationId },
          select: { id: true },
        }))
      )
        throw this.notFound();
      const rows = await tenant.webhookDispatch.findMany({
        where: { subscriptionId: id, organizationId },
        take: 50,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: webhookDispatchSummarySelect,
      });
      return rows.map(toWebhookDispatchSummary);
    });
  }
  private summary(row: SubscriptionSummaryRow): WebhookSubscriptionSummary {
    return WebhookSubscriptionSummarySchema.parse({
      id: row.id,
      name: row.name,
      targetUrl: row.targetUrl,
      eventTypes: row.eventTypes,
      isActive: row.isActive,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  private validateTarget(target: string): void {
    try {
      assertSafeWebhookTargetUrl(target);
    } catch {
      throw new BadRequestException({
        code: "WEBHOOK_UNSAFE_TARGET",
        message: "Destino HTTPS público inválido.",
      });
    }
  }
  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "WEBHOOK_SUBSCRIPTION_NOT_FOUND",
      message: "Assinatura não encontrada.",
    });
  }
  private async audit(
    tenant: Prisma.TransactionClient,
    context: WebhookManagementContext,
    id: string,
    action: string,
    row: SubscriptionSummaryRow
  ): Promise<void> {
    await tenant.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        entityType: "webhook_subscription",
        entityId: id,
        action,
        ipAddress: context.ipAddress ?? null,
        after: {
          eventTypes: row.eventTypes,
          isActive: row.isActive,
          version: row.version,
        },
      },
    });
  }
}

import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
export type WebhookEventInput = {
  organizationId: string;
  eventType:
    | "company.created"
    | "opportunity.won"
    | "opportunity.lost"
    | "ticket.closed";
  entityId: string;
  entityVersion: number;
  requestId: string;
  occurredAt?: Date;
};
/** The caller supplies its existing business transaction: never open another here. */
export async function enqueueWebhookEvent(
  tenant: Prisma.TransactionClient,
  input: WebhookEventInput
): Promise<void> {
  const subscriptions = await tenant.webhookSubscription.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      eventTypes: { has: input.eventType },
    },
    select: { id: true, version: true, targetUrl: true, encryptedSecret: true },
  });
  if (!subscriptions.length) return;
  const eventId = randomUUID();
  const occurredAt = input.occurredAt ?? new Date();
  const payload = {
    id: eventId,
    type: input.eventType,
    version: 1,
    occurredAt: occurredAt.toISOString(),
    organizationId: input.organizationId,
    data: { entityId: input.entityId, version: input.entityVersion },
  };
  await tenant.webhookDispatch.createMany({
    data: subscriptions.map(subscription => ({
      organizationId: input.organizationId,
      subscriptionId: subscription.id,
      subscriptionVersion: subscription.version,
      eventId,
      eventType: input.eventType,
      payload,
      targetUrl: subscription.targetUrl,
      encryptedSecret: subscription.encryptedSecret,
      requestId: input.requestId,
      nextAttemptAt: occurredAt,
    })),
  });
}

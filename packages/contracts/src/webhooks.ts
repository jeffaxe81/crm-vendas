import { z } from "zod";

export const WebhookEventTypeSchema = z.enum([
  "company.created",
  "opportunity.won",
  "opportunity.lost",
  "ticket.closed",
]);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;
const TargetUrlSchema = z
  .url()
  .max(2048)
  .refine(
    value =>
      /^https:\/\/(?:\[[0-9a-f:.]+\]|[^/:?#@\\\s]+)(?::443)?(?:\/[^?#\\]*)?$/i.test(
        value
      ) && !/[\x00-\x20\x7f]/.test(value),
    "Destino deve usar HTTPS na porta 443, sem credenciais, query ou fragmento."
  );
const NameSchema = z.string().trim().min(1).max(160);
const EventTypesSchema = z
  .array(WebhookEventTypeSchema)
  .min(1)
  .max(4)
  .refine(
    events => new Set(events).size === events.length,
    "Eventos duplicados."
  );
export const WebhookSubscriptionCreateInputSchema = z
  .object({
    name: NameSchema,
    targetUrl: TargetUrlSchema,
    eventTypes: EventTypesSchema,
  })
  .strict();
export const WebhookSubscriptionUpdateInputSchema = z
  .object({
    version: z.number().int().positive(),
    name: NameSchema.optional(),
    targetUrl: TargetUrlSchema.optional(),
    eventTypes: EventTypesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    input => Object.keys(input).some(key => key !== "version"),
    "Informe uma alteração."
  );
export const WebhookSubscriptionSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: NameSchema,
    targetUrl: TargetUrlSchema,
    eventTypes: EventTypesSchema,
    isActive: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const WebhookSubscriptionCreatedSchema =
  WebhookSubscriptionSummarySchema.extend({ plainSecret: z.string().min(1) });
export const WebhookDeliverySummarySchema = z
  .object({
    id: z.string().uuid(),
    attempt: z.number().int().min(1).max(5),
    status: z.enum(["DELIVERED", "FAILED"]),
    responseStatus: z.number().int().min(100).max(599).nullable(),
    errorCode: z.string().max(80).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const WebhookDispatchSummarySchema = z
  .object({
    id: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    eventId: z.string().uuid(),
    eventType: z.enum([...WebhookEventTypeSchema.options, "webhook.test"]),
    status: z.enum([
      "PENDING",
      "PROCESSING",
      "RETRY_SCHEDULED",
      "DELIVERED",
      "EXHAUSTED",
      "CANCELLED",
    ]),
    attemptCount: z.number().int().min(0).max(5),
    nextAttemptAt: z.iso.datetime().nullable(),
    lastErrorCode: z.string().max(80).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    deliveries: z.array(WebhookDeliverySummarySchema),
  })
  .strict();
export type WebhookSubscriptionCreateInput = z.infer<
  typeof WebhookSubscriptionCreateInputSchema
>;
export type WebhookSubscriptionUpdateInput = z.infer<
  typeof WebhookSubscriptionUpdateInputSchema
>;
export type WebhookSubscriptionSummary = z.infer<
  typeof WebhookSubscriptionSummarySchema
>;
export type WebhookSubscriptionCreated = z.infer<
  typeof WebhookSubscriptionCreatedSchema
>;
export type WebhookDispatchSummary = z.infer<
  typeof WebhookDispatchSummarySchema
>;
export type WebhookDeliverySummary = z.infer<
  typeof WebhookDeliverySummarySchema
>;

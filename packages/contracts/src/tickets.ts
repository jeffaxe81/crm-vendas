import { z } from "zod";

import { PaginationQuerySchema } from "./companies";

export const TicketStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
]);
export const TicketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const TicketChannelSchema = z.enum([
  "PHONE",
  "EMAIL",
  "WHATSAPP",
  "WEB",
  "IN_PERSON",
  "OTHER",
]);
export const TicketEventTypeSchema = z.enum([
  "CREATED",
  "COMMENT",
  "STATUS_CHANGED",
  "ASSIGNED",
  "UPDATED",
]);

export type TicketStatus = z.infer<typeof TicketStatusSchema>;
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;
export type TicketChannel = z.infer<typeof TicketChannelSchema>;
export type TicketEventType = z.infer<typeof TicketEventTypeSchema>;

/** Transições permitidas (C5.1). Estados finais não têm saída. */
export const TICKET_STATUS_TRANSITIONS: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  OPEN: ["IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "RESOLVED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  CANCELLED: [],
};

export const TICKET_FINAL_STATUSES: readonly TicketStatus[] = [
  "CLOSED",
  "CANCELLED",
];

export function canTransitionTicket(
  from: TicketStatus,
  to: TicketStatus
): boolean {
  return TICKET_STATUS_TRANSITIONS[from].includes(to);
}

export const TicketCreateInputSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000).optional(),
    priority: TicketPrioritySchema.default("MEDIUM"),
    channel: TicketChannelSchema.default("OTHER"),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    assigneeUserId: z.string().uuid().optional(),
  })
  .strict();

export const TicketUpdateInputSchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    priority: TicketPrioritySchema.optional(),
    channel: TicketChannelSchema.optional(),
    companyId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    value =>
      Object.entries(value).some(
        ([key, item]) => key !== "version" && item !== undefined
      ),
    { message: "Informe ao menos uma alteração além de version." }
  );

export const TicketStatusChangeInputSchema = z
  .object({
    status: TicketStatusSchema,
    note: z.string().trim().min(1).max(20_000).optional(),
    version: z.number().int().min(1),
  })
  .strict();

export const TicketCommentInputSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
    isInternal: z.boolean().default(false),
    version: z.number().int().min(1),
  })
  .strict();

export const TicketListQuerySchema = PaginationQuerySchema.extend({
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  channel: TicketChannelSchema.optional(),
  assigneeUserId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  sortBy: z
    .enum(["openedAt", "updatedAt", "priority", "protocol"])
    .default("openedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type TicketCreateInput = z.infer<typeof TicketCreateInputSchema>;
export type TicketUpdateInput = z.infer<typeof TicketUpdateInputSchema>;
export type TicketStatusChangeInput = z.infer<
  typeof TicketStatusChangeInputSchema
>;
export type TicketCommentInput = z.infer<typeof TicketCommentInputSchema>;
export type TicketListQuery = z.infer<typeof TicketListQuerySchema>;

/** Protocolo `AAAA-NNNNNN` (sequência com no mínimo 6 dígitos). */
export function formatTicketProtocol(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, "0")}`;
}

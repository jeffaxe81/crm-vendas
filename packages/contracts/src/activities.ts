import { z } from "zod";

import { PaginationQuerySchema } from "./companies";

export const ActivityTypeSchema = z.enum(["TASK", "APPOINTMENT"]);
export const ActivityStatusSchema = z.enum([
  "PENDING",
  "COMPLETED",
  "CANCELLED",
]);
export const ActivityPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const ActivityDateTimeSchema = z.string().datetime({ offset: true });
const OptionalNullableTextSchema = z
  .string()
  .trim()
  .max(10_000)
  .nullable()
  .optional();

export const ActivityCreateInputSchema = z.object({
  type: ActivityTypeSchema,
  priority: ActivityPrioritySchema.default("MEDIUM"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  ownerUserId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  dueAt: ActivityDateTimeSchema.optional(),
});

export const ActivityUpdateInputSchema = z
  .object({
    type: ActivityTypeSchema.optional(),
    status: ActivityStatusSchema.optional(),
    priority: ActivityPrioritySchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: OptionalNullableTextSchema,
    ownerUserId: z.string().uuid().optional(),
    companyId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    opportunityId: z.string().uuid().nullable().optional(),
    dueAt: ActivityDateTimeSchema.nullable().optional(),
  })
  .refine(value => Object.values(value).some(item => item !== undefined), {
    message: "Informe ao menos uma alteração.",
  });

export const ActivityListQuerySchema = PaginationQuerySchema.extend({
  type: ActivityTypeSchema.optional(),
  status: ActivityStatusSchema.optional(),
  priority: ActivityPrioritySchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  dueFrom: ActivityDateTimeSchema.optional(),
  dueTo: ActivityDateTimeSchema.optional(),
  sortBy: z.enum(["dueAt", "createdAt", "updatedAt", "title"]).default("dueAt"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type ActivityStatus = z.infer<typeof ActivityStatusSchema>;
export type ActivityPriority = z.infer<typeof ActivityPrioritySchema>;
export type ActivityCreateInput = z.infer<typeof ActivityCreateInputSchema>;
export type ActivityUpdateInput = z.infer<typeof ActivityUpdateInputSchema>;
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;

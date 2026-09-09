import { z } from "zod";

import { PaginationQuerySchema } from "./companies";

const UuidSchema = z.string().uuid();
const CurrencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);

export const OpportunityStatusSchema = z.enum(["OPEN", "WON", "LOST"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

export const PipelineCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  isDefault: z.boolean().default(false),
});

export const PipelineUpdateInputSchema =
  PipelineCreateInputSchema.partial().refine(
    value => Object.values(value).some(item => item !== undefined),
    { message: "Informe ao menos uma alteração." }
  );

export const PipelineStageCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  position: z.number().int().min(0),
});

export const PipelineStageUpdateInputSchema =
  PipelineStageCreateInputSchema.partial().refine(
    value => Object.values(value).some(item => item !== undefined),
    { message: "Informe ao menos uma alteração." }
  );

export const PipelineStageReorderInputSchema = z.object({
  stageIds: z.array(UuidSchema).min(1),
});

export const OpportunityCreateInputSchema = z.object({
  companyId: UuidSchema,
  contactId: UuidSchema.optional(),
  ownerUserId: UuidSchema,
  pipelineId: UuidSchema,
  stageId: UuidSchema,
  title: z.string().trim().min(1).max(200),
  estimatedValue: z.number().finite().nonnegative(),
  currency: CurrencyCodeSchema,
  expectedCloseDate: z.coerce.date().optional(),
});

export const OpportunityUpdateInputSchema = z
  .object({
    companyId: UuidSchema.optional(),
    contactId: UuidSchema.nullable().optional(),
    ownerUserId: UuidSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    estimatedValue: z.number().finite().nonnegative().optional(),
    currency: CurrencyCodeSchema.optional(),
    expectedCloseDate: z.coerce.date().nullable().optional(),
  })
  .refine(value => Object.values(value).some(item => item !== undefined), {
    message: "Informe ao menos uma alteração.",
  });

export const OpportunityMoveInputSchema = z.object({
  stageId: UuidSchema,
});

export const OpportunityCloseInputSchema = z
  .object({
    status: z.enum(["WON", "LOST"]),
    lossReason: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "WON" && value.lossReason !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lossReason"],
        message:
          "Motivo de perda só pode ser informado para oportunidades perdidas.",
      });
    }
  });

export const OpportunityListQuerySchema = PaginationQuerySchema.extend({
  companyId: UuidSchema.optional(),
  contactId: UuidSchema.optional(),
  ownerUserId: UuidSchema.optional(),
  pipelineId: UuidSchema.optional(),
  stageId: UuidSchema.optional(),
  status: OpportunityStatusSchema.optional(),
});

export type PipelineCreateInput = z.infer<typeof PipelineCreateInputSchema>;
export type PipelineUpdateInput = z.infer<typeof PipelineUpdateInputSchema>;
export type PipelineStageCreateInput = z.infer<
  typeof PipelineStageCreateInputSchema
>;
export type PipelineStageUpdateInput = z.infer<
  typeof PipelineStageUpdateInputSchema
>;
export type PipelineStageReorderInput = z.infer<
  typeof PipelineStageReorderInputSchema
>;
export type OpportunityCreateInput = z.infer<
  typeof OpportunityCreateInputSchema
>;
export type OpportunityUpdateInput = z.infer<
  typeof OpportunityUpdateInputSchema
>;
export type OpportunityMoveInput = z.infer<typeof OpportunityMoveInputSchema>;
export type OpportunityCloseInput = z.infer<typeof OpportunityCloseInputSchema>;
export type OpportunityListQuery = z.infer<typeof OpportunityListQuerySchema>;

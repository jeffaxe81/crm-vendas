import { z } from "zod";

import { PaginationQuerySchema } from "./companies";

const OpportunityDateTimeSchema = z.string().datetime({ offset: true });

export const OpportunityDecimalSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,16})(\.\d{1,2})?$/,
    "Informe um valor decimal não negativo com até 17 dígitos inteiros e 2 casas decimais."
  );

const customerFields = {
  companyId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
};

export const OpportunityCreateInputSchema = z
  .object({
    pipelineId: z.string().uuid(),
    stageId: z.string().uuid(),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    ownerUserId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    estimatedValue: OpportunityDecimalSchema,
    expectedCloseAt: OpportunityDateTimeSchema.optional(),
    notes: z.string().trim().max(10_000).optional(),
  })
  .refine(
    value =>
      Number(Boolean(value.companyId)) + Number(Boolean(value.contactId)) === 1,
    {
      message: "Informe exatamente um cliente: companyId ou contactId.",
    }
  );

export const OpportunityUpdateInputSchema = z
  .object({
    ...customerFields,
    ownerUserId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    estimatedValue: OpportunityDecimalSchema.optional(),
    expectedCloseAt: OpportunityDateTimeSchema.nullable().optional(),
    notes: z.string().trim().max(10_000).nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    value =>
      Object.entries(value).some(
        ([key, item]) => key !== "version" && item !== undefined
      ),
    {
      message: "Informe ao menos uma alteração além de version.",
    }
  );

export const OpportunityMoveInputSchema = z.object({
  stageId: z.string().uuid(),
  version: z.number().int().min(1),
});

export const OpportunityListQuerySchema = PaginationQuerySchema.extend({
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  expectedCloseFrom: OpportunityDateTimeSchema.optional(),
  expectedCloseTo: OpportunityDateTimeSchema.optional(),
  sortBy: z
    .enum(["updatedAt", "createdAt", "expectedCloseAt", "estimatedValue"])
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type OpportunityCreateInput = z.infer<
  typeof OpportunityCreateInputSchema
>;
export type OpportunityUpdateInput = z.infer<
  typeof OpportunityUpdateInputSchema
>;
export type OpportunityMoveInput = z.infer<typeof OpportunityMoveInputSchema>;
export type OpportunityListQuery = z.infer<typeof OpportunityListQuerySchema>;

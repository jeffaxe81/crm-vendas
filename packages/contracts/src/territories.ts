import { z } from "zod";

import { PaginationQuerySchema } from "./companies";

export const TerritoryQuotaPeriodSchema = z.enum(["MONTH", "QUARTER", "YEAR"]);

export const TerritoryCoverageStatusSchema = z.enum([
  "UNCOVERED",
  "PARTIAL",
  "COVERED",
]);

export const TerritoryCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  region: z.string().trim().min(1).max(120),
  description: z.string().trim().max(10_000).optional(),
  salesRepId: z.string().uuid().optional(),
});

export const TerritoryUpdateInputSchema =
  TerritoryCreateInputSchema.partial().refine(
    value => Object.values(value).some(item => item !== undefined),
    { message: "Informe ao menos uma alteração." }
  );

export const TerritoryReassignInputSchema = z.object({
  salesRepId: z.string().uuid(),
});

export const TerritoryListQuerySchema = PaginationQuerySchema.extend({
  region: z.string().trim().min(1).max(120).optional(),
  sortBy: z.enum(["name", "region", "createdAt", "updatedAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const TerritoryQuotaInputSchema = z
  .object({
    period: TerritoryQuotaPeriodSchema,
    year: z.coerce.number().int().min(2000).max(2100),
    periodIndex: z.coerce.number().int().min(0).max(12).optional(),
    amount: z.coerce.number().min(0),
    actual: z.coerce.number().min(0).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.period === "MONTH" &&
      (value.periodIndex === undefined ||
        value.periodIndex < 1 ||
        value.periodIndex > 12)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodIndex"],
        message: "Informe o mês entre 1 e 12.",
      });
    }

    if (
      value.period === "QUARTER" &&
      (value.periodIndex === undefined ||
        value.periodIndex < 1 ||
        value.periodIndex > 4)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodIndex"],
        message: "Informe o trimestre entre 1 e 4.",
      });
    }

    if (
      value.period === "YEAR" &&
      value.periodIndex !== undefined &&
      value.periodIndex !== 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodIndex"],
        message: "Cota anual não possui subdivisão.",
      });
    }
  });

export const TerritoryQuotaQuerySchema = z.object({
  period: TerritoryQuotaPeriodSchema.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  periodIndex: z.coerce.number().int().min(0).max(12).optional(),
});

export const TerritoryCoverageTargetInputSchema = z.object({
  companyId: z.string().uuid(),
  coverageStatus: TerritoryCoverageStatusSchema.optional(),
});

export type TerritoryQuotaPeriod = z.infer<typeof TerritoryQuotaPeriodSchema>;
export type TerritoryCoverageStatus = z.infer<
  typeof TerritoryCoverageStatusSchema
>;
export type TerritoryCreateInput = z.infer<typeof TerritoryCreateInputSchema>;
export type TerritoryUpdateInput = z.infer<typeof TerritoryUpdateInputSchema>;
export type TerritoryReassignInput = z.infer<
  typeof TerritoryReassignInputSchema
>;
export type TerritoryListQuery = z.infer<typeof TerritoryListQuerySchema>;
export type TerritoryQuotaInput = z.infer<typeof TerritoryQuotaInputSchema>;
export type TerritoryQuotaQuery = z.infer<typeof TerritoryQuotaQuerySchema>;
export type TerritoryCoverageTargetInput = z.infer<
  typeof TerritoryCoverageTargetInputSchema
>;

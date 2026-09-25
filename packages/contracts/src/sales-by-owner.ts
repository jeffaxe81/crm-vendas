import { z } from "zod";

import { ReportMoneySchema } from "./sales-by-product";

const ReportDateTimeSchema = z.string().datetime({ offset: true });

/** Taxa de conversão em percentual com 1 casa (ex.: "66.7"). */
export const ReportPercentSchema = z.string().regex(/^\d{1,3}\.\d$/);

export const SalesByOwnerQuerySchema = z
  .object({
    from: ReportDateTimeSchema.optional(),
    to: ReportDateTimeSchema.optional(),
    pipelineId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    value =>
      !value.from ||
      !value.to ||
      new Date(value.from).getTime() <= new Date(value.to).getTime(),
    {
      message: "A data inicial deve ser anterior ou igual à data final.",
      path: ["to"],
    }
  );

export const SalesByOwnerBucketSchema = z.object({
  opportunities: z.number().int().nonnegative(),
  value: ReportMoneySchema,
});

const OwnerBucketsShape = {
  open: SalesByOwnerBucketSchema,
  won: SalesByOwnerBucketSchema,
  lost: SalesByOwnerBucketSchema,
  total: SalesByOwnerBucketSchema,
  /** Ganhas ÷ (ganhas + perdidas), por quantidade; null sem fechamentos. */
  winRate: ReportPercentSchema.nullable(),
};

export const SalesByOwnerRowSchema = z.object({
  ownerUserId: z.string().uuid(),
  ownerName: z.string(),
  ownerActive: z.boolean(),
  ...OwnerBucketsShape,
});

export const SalesByOwnerReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
    pipelineId: z.string().uuid().nullable(),
  }),
  items: z.array(SalesByOwnerRowSchema),
  totals: z.object(OwnerBucketsShape),
});

export type SalesByOwnerQuery = z.infer<typeof SalesByOwnerQuerySchema>;
export type SalesByOwnerBucket = z.infer<typeof SalesByOwnerBucketSchema>;
export type SalesByOwnerRow = z.infer<typeof SalesByOwnerRowSchema>;
export type SalesByOwnerReport = z.infer<typeof SalesByOwnerReportSchema>;

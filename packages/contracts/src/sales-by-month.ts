import { z } from "zod";

import { ReportMoneySchema } from "./sales-by-product";

/** Ganhas ÷ (ganhas + perdidas) em percentual com 1 casa (ex.: "66.7"). */
const ReportPercentSchema = z.string().regex(/^\d{1,3}\.\d$/);

export const SalesByMonthQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
    pipelineId: z.string().uuid().optional(),
  })
  .strict();

export const SalesByMonthBucketSchema = z.object({
  opportunities: z.number().int().nonnegative(),
  value: ReportMoneySchema,
});

const MonthBucketsShape = {
  open: SalesByMonthBucketSchema,
  won: SalesByMonthBucketSchema,
  lost: SalesByMonthBucketSchema,
  total: SalesByMonthBucketSchema,
  /** Ganhas ÷ (ganhas + perdidas), por quantidade; null sem fechamentos. */
  winRate: ReportPercentSchema.nullable(),
};

export const SalesByMonthRowSchema = z.object({
  /** 1 (janeiro) a 12 (dezembro). */
  month: z.number().int().min(1).max(12),
  ...MonthBucketsShape,
});

export const SalesByMonthReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    year: z.number().int(),
    pipelineId: z.string().uuid().nullable(),
  }),
  /** Sempre 12 posições (janeiro a dezembro), mesmo sem movimentação. */
  items: z.array(SalesByMonthRowSchema),
  totals: z.object(MonthBucketsShape),
});

export type SalesByMonthQuery = z.infer<typeof SalesByMonthQuerySchema>;
export type SalesByMonthBucket = z.infer<typeof SalesByMonthBucketSchema>;
export type SalesByMonthRow = z.infer<typeof SalesByMonthRowSchema>;
export type SalesByMonthReport = z.infer<typeof SalesByMonthReportSchema>;

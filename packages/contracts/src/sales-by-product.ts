import { z } from "zod";

const ReportDateTimeSchema = z.string().datetime({ offset: true });

/** Valor monetário serializado como string com exatamente 2 casas. */
export const ReportMoneySchema = z.string().regex(/^\d+\.\d{2}$/);

/** Quantidade serializada como string com exatamente 3 casas. */
export const ReportQuantitySchema = z.string().regex(/^\d+\.\d{3}$/);

export const SalesByProductQuerySchema = z
  .object({
    from: ReportDateTimeSchema.optional(),
    to: ReportDateTimeSchema.optional(),
    pipelineId: z.string().uuid().optional(),
    ownerUserId: z.string().uuid().optional(),
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

export const SalesByProductBucketSchema = z.object({
  quantity: ReportQuantitySchema,
  opportunities: z.number().int().nonnegative(),
  value: ReportMoneySchema,
});

export const SalesByProductRowSchema = z.object({
  productId: z.string().uuid(),
  productCode: z.string(),
  productName: z.string(),
  productActive: z.boolean(),
  productDeleted: z.boolean(),
  open: SalesByProductBucketSchema,
  won: SalesByProductBucketSchema,
  lost: SalesByProductBucketSchema,
  total: SalesByProductBucketSchema,
});

export const SalesByProductReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
    pipelineId: z.string().uuid().nullable(),
    ownerUserId: z.string().uuid().nullable(),
  }),
  items: z.array(SalesByProductRowSchema),
  totals: z.object({
    open: SalesByProductBucketSchema,
    won: SalesByProductBucketSchema,
    lost: SalesByProductBucketSchema,
    total: SalesByProductBucketSchema,
  }),
});

export type SalesByProductQuery = z.infer<typeof SalesByProductQuerySchema>;
export type SalesByProductBucket = z.infer<typeof SalesByProductBucketSchema>;
export type SalesByProductRow = z.infer<typeof SalesByProductRowSchema>;
export type SalesByProductReport = z.infer<typeof SalesByProductReportSchema>;

import { z } from "zod";

const FunnelDateTimeSchema = z.string().datetime({ offset: true });

/** Valor monetário serializado como string com exatamente 2 casas. */
const FunnelMoneySchema = z.string().regex(/^\d+\.\d{2}$/);

/**
 * Taxa percentual (0 a 100) serializada como string com exatamente 2 casas,
 * por exemplo `"66.67"` para 2 ganhas em 3 encerradas.
 */
export const FunnelPercentSchema = z
  .string()
  .regex(/^(?:100\.00|\d{1,2}\.\d{2})$/);

export const FunnelStageKindSchema = z.enum(["OPEN", "WON", "LOST"]);

export const FunnelQuerySchema = z
  .object({
    pipelineId: z.string().uuid(),
    from: FunnelDateTimeSchema.optional(),
    to: FunnelDateTimeSchema.optional(),
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

export const FunnelBucketSchema = z.object({
  opportunities: z.number().int().nonnegative(),
  value: FunnelMoneySchema,
});

export const FunnelStageRowSchema = z.object({
  stageId: z.string().uuid(),
  name: z.string(),
  kind: FunnelStageKindSchema,
  position: z.number().int(),
  opportunities: z.number().int().nonnegative(),
  value: FunnelMoneySchema,
});

export const FunnelIndicatorsSchema = z.object({
  openOpportunities: z.number().int().nonnegative(),
  wonOpportunities: z.number().int().nonnegative(),
  lostOpportunities: z.number().int().nonnegative(),
  /** ganhas / (ganhas + perdidas) em %, ou `null` sem oportunidades encerradas. */
  winRate: FunnelPercentSchema.nullable(),
  openValue: FunnelMoneySchema,
  wonValue: FunnelMoneySchema,
  lostValue: FunnelMoneySchema,
  /** valor ganho / quantidade ganha, ou `null` sem oportunidades ganhas. */
  averageWonTicket: FunnelMoneySchema.nullable(),
});

export const FunnelReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    pipelineId: z.string().uuid(),
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
    ownerUserId: z.string().uuid().nullable(),
  }),
  pipeline: z.object({
    id: z.string().uuid(),
    name: z.string(),
    isActive: z.boolean(),
  }),
  stages: z.array(FunnelStageRowSchema),
  /** Oportunidades paradas em etapas inativas (fora das linhas do funil). */
  inactiveStages: FunnelBucketSchema,
  totals: FunnelBucketSchema,
  indicators: FunnelIndicatorsSchema,
});

export type FunnelQuery = z.infer<typeof FunnelQuerySchema>;
export type FunnelStageKind = z.infer<typeof FunnelStageKindSchema>;
export type FunnelBucket = z.infer<typeof FunnelBucketSchema>;
export type FunnelStageRow = z.infer<typeof FunnelStageRowSchema>;
export type FunnelIndicators = z.infer<typeof FunnelIndicatorsSchema>;
export type FunnelReport = z.infer<typeof FunnelReportSchema>;

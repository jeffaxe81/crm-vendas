import { z } from "zod";

import { ActivityTypeSchema } from "./activities";

const ReportDateTimeSchema = z.string().datetime({ offset: true });

export const ActivitiesByOwnerQuerySchema = z
  .object({
    from: ReportDateTimeSchema.optional(),
    to: ReportDateTimeSchema.optional(),
    type: ActivityTypeSchema.optional(),
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

const CountSchema = z.number().int().nonnegative();

/** Contagens de atividades de um recorte (responsável ou total geral). */
export const ActivitiesByOwnerCountsSchema = z.object({
  total: CountSchema,
  completed: CountSchema,
  pending: CountSchema,
  cancelled: CountSchema,
  overdue: CountSchema,
  completedOnTime: CountSchema,
  /** concluídas / total, entre 0 e 1; `null` quando total = 0. */
  completionRate: z.number().min(0).max(1).nullable(),
  byType: z.object({
    TASK: CountSchema,
    APPOINTMENT: CountSchema,
  }),
});

export const ActivitiesByOwnerRowSchema = ActivitiesByOwnerCountsSchema.extend({
  ownerUserId: z.string().uuid(),
  ownerDisplayName: z.string(),
  /** `false` quando a membership ou o usuário estão desativados. */
  ownerActive: z.boolean(),
});

export const ActivitiesByOwnerReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
    type: ActivityTypeSchema.nullable(),
  }),
  items: z.array(ActivitiesByOwnerRowSchema),
  totals: ActivitiesByOwnerCountsSchema,
});

export type ActivitiesByOwnerQuery = z.infer<
  typeof ActivitiesByOwnerQuerySchema
>;
export type ActivitiesByOwnerCounts = z.infer<
  typeof ActivitiesByOwnerCountsSchema
>;
export type ActivitiesByOwnerRow = z.infer<typeof ActivitiesByOwnerRowSchema>;
export type ActivitiesByOwnerReport = z.infer<
  typeof ActivitiesByOwnerReportSchema
>;

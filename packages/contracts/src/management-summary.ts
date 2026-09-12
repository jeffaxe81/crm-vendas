import { z } from "zod";

export const ManagementSummarySchema = z.object({
  asOf: z.string().datetime(),
  opportunitiesByStage: z.array(
    z.object({
      pipelineId: z.string().uuid(),
      pipelineName: z.string(),
      stageId: z.string().uuid(),
      stageName: z.string(),
      count: z.number().int().nonnegative(),
    })
  ),
  openEstimatedValue: z.string().regex(/^\d+\.\d{2}$/),
  pendingActivities: z.number().int().nonnegative(),
  overdueActivities: z.number().int().nonnegative(),
  undatedActivities: z.number().int().nonnegative(),
});

export type ManagementSummary = z.infer<typeof ManagementSummarySchema>;

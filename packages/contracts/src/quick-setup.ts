import { z } from "zod";

export const QuickSetupStepIdSchema = z.enum([
  "organization",
  "team",
  "sales-structure",
  "commercial-data",
  "help",
  "review",
]);

export const QuickSetupStepSchema = z.object({
  id: QuickSetupStepIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  destination: z.string().min(1).optional(),
});

export const QuickSetupStateSchema = z.object({
  completed: z.boolean(),
  completedSteps: z.array(QuickSetupStepIdSchema),
  steps: z.array(QuickSetupStepSchema),
});

export const QuickSetupProgressInputSchema = z
  .object({
    stepId: QuickSetupStepIdSchema,
    complete: z.boolean().optional(),
  })
  .strict();

export type QuickSetupStepId = z.infer<typeof QuickSetupStepIdSchema>;
export type QuickSetupStep = z.infer<typeof QuickSetupStepSchema>;
export type QuickSetupState = z.infer<typeof QuickSetupStateSchema>;
export type QuickSetupProgressInput = z.infer<
  typeof QuickSetupProgressInputSchema
>;

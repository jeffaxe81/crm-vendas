import { z } from "zod";

export const OnboardingStateSchema = z.object({
  organization: z.object({
    eligible: z.boolean(),
    completed: z.boolean(),
    step: z.number().int().min(1).max(4),
    name: z.string(),
  }),
  tour: z.object({
    status: z.enum(["PENDING", "COMPLETED", "SKIPPED"]),
  }),
});
export const OrganizationOnboardingInputSchema = z
  .object({
    step: z.number().int().min(1).max(4),
    name: z.string().trim().min(2).max(160).optional(),
    complete: z.boolean().optional(),
  })
  .strict();
export const TourCompletionInputSchema = z
  .object({ status: z.enum(["COMPLETED", "SKIPPED"]) })
  .strict();
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;
export type OrganizationOnboardingInput = z.infer<
  typeof OrganizationOnboardingInputSchema
>;
export type TourCompletionInput = z.infer<typeof TourCompletionInputSchema>;

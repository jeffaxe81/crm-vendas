import { z } from "zod";

const confirmation = z.object({
  previewId: z.string().uuid(),
  password: z.string().min(1).max(1024),
});
export const RestoreExecutionRequestSchema = confirmation
  .extend({ confirmation: z.literal("RESTAURAR DADOS") })
  .strict();
export const DeleteExecutionRequestSchema = confirmation
  .extend({ confirmation: z.literal("EXCLUIR DADOS OPERACIONAIS") })
  .strict();
export const RecoveryCapabilitiesSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  confirmationPhrases: z.object({
    restore: z.literal("RESTAURAR DADOS"),
    delete: z.literal("EXCLUIR DADOS OPERACIONAIS"),
  }),
  maxPreviewAgeSeconds: z.number().int().positive(),
});
export type RestoreExecutionRequest = z.infer<
  typeof RestoreExecutionRequestSchema
>;
export type DeleteExecutionRequest = z.infer<
  typeof DeleteExecutionRequestSchema
>;

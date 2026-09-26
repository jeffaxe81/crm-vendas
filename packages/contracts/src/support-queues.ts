import { z } from "zod";

/** C5.2 — filas de atendimento. */
export const SupportQueueCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).optional(),
    isActive: z.boolean().default(true),
    autoAssign: z.boolean().default(false),
  })
  .strict();

export const SupportQueueUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    isActive: z.boolean().optional(),
    autoAssign: z.boolean().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    value =>
      Object.entries(value).some(
        ([key, item]) => key !== "version" && item !== undefined
      ),
    { message: "Informe ao menos uma alteração além de version." }
  );

export const SupportQueueListQuerySchema = z.object({
  active: z
    .enum(["true", "false", "all"])
    .default("all")
    .transform(value => (value === "all" ? undefined : value === "true")),
});

export type SupportQueueCreateInput = z.infer<
  typeof SupportQueueCreateInputSchema
>;
export type SupportQueueUpdateInput = z.infer<
  typeof SupportQueueUpdateInputSchema
>;
export type SupportQueueListQuery = z.infer<typeof SupportQueueListQuerySchema>;

/** Representação pública de uma fila (listagem inclui a carga aberta). */
export type SupportQueue = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  autoAssign: boolean;
  version: number;
  openTicketCount: number;
  createdAt: string;
  updatedAt: string;
};

import { z } from "zod";

export const TagInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type TagInput = z.infer<typeof TagInputSchema>;

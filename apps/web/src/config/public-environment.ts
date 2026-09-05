import { z } from "zod";

const PublicEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
});

export type PublicEnvironment = z.infer<typeof PublicEnvironmentSchema>;

export function parsePublicEnvironment(
  input: Record<string, unknown>
): PublicEnvironment {
  return PublicEnvironmentSchema.parse(input);
}

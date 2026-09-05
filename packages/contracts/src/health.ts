import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  database: z.literal("up").optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function createHealthResponse(
  service: string,
  database?: "up"
): HealthResponse {
  return {
    status: "ok",
    service,
    ...(database ? { database } : {}),
  };
}

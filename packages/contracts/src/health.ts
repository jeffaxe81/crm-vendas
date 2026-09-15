import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "error"]),
  service: z.string().min(1),
  database: z.enum(["up", "down"]).optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function createHealthResponse(
  service: string,
  database?: "up" | "down"
): HealthResponse {
  return {
    status: database === "down" ? "error" : "ok",
    service,
    ...(database ? { database } : {}),
  };
}

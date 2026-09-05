import { z } from "zod";

const ApiEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      value =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL deve usar PostgreSQL."
    ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;

export function parseApiEnvironment(
  input: Record<string, unknown>
): ApiEnvironment {
  return ApiEnvironmentSchema.parse(input);
}

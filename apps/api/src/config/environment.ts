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
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  JWT_ACCESS_SECRET: z.string().min(32),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  AUTH_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3600)
    .max(60 * 60 * 24 * 90)
    .default(60 * 60 * 24 * 30),
});

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;

export function parseApiEnvironment(
  input: Record<string, unknown>
): ApiEnvironment {
  return ApiEnvironmentSchema.parse(input);
}

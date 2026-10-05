import { z } from "zod";
import { isAbsolute, normalize, sep } from "node:path";

const ApiEnvironmentSchema = z
  .object({
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
    // Restricted, non-superuser connection the running app queries through.
    // Kept separate from DATABASE_URL (the schema-owner connection used by
    // Prisma CLI for migrations) because a superuser role has BYPASSRLS by
    // nature and would silently defeat every Row-Level Security tenant policy.
    APP_DATABASE_URL: z
      .string()
      .url()
      .refine(
        value =>
          value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "APP_DATABASE_URL deve usar PostgreSQL."
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
    BACKUP_DIRECTORY: z
      .string()
      .refine(
        value =>
          isAbsolute(value) &&
          normalize(value) !== sep &&
          !normalize(value).split(sep).includes("public"),
        "BACKUP_DIRECTORY deve ser um diretório privado absoluto."
      )
      .optional(),
    BACKUP_ENCRYPTION_KEY: z
      .string()
      .refine(value => {
        const bytes = Buffer.from(value, "base64");
        return bytes.length === 32 && bytes.toString("base64") === value;
      }, "BACKUP_ENCRYPTION_KEY deve conter 32 bytes em base64 canônico.")
      .optional(),
    BACKUP_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1048576)
      .max(268435456)
      .default(67108864),
    BACKUP_SNAPSHOT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(300000)
      .default(60000),
  })
  .superRefine((value, context) => {
    if (
      Boolean(value.BACKUP_DIRECTORY) !== Boolean(value.BACKUP_ENCRYPTION_KEY)
    )
      context.addIssue({
        code: "custom",
        path: ["BACKUP_DIRECTORY"],
        message:
          "BACKUP_DIRECTORY e BACKUP_ENCRYPTION_KEY devem ser configurados juntos.",
      });
  });

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;

export function parseApiEnvironment(
  input: Record<string, unknown>
): ApiEnvironment {
  return ApiEnvironmentSchema.parse(input);
}

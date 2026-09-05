import type { Params } from "nestjs-pino";
import { z } from "zod";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.token",
  "req.body.secret",
  "password",
  "token",
  "secret",
];

const LoggerEnvironmentSchema = z.object({
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export function createLoggerOptions(
  input: Record<string, unknown> = process.env
): Params {
  const environment = LoggerEnvironmentSchema.parse(input);

  return {
    pinoHttp: {
      level: environment.LOG_LEVEL,
      redact: {
        paths: REDACTED_PATHS,
        censor: "[REDACTED]",
      },
    },
  };
}

export { REDACTED_PATHS };

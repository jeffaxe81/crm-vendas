import type { Params } from 'nestjs-pino';

import { parseApiEnvironment } from '../config/environment';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'password',
  'token',
  'secret',
];

export function createLoggerOptions(
  input: Record<string, unknown> = process.env,
): Params {
  const environment = parseApiEnvironment(input);

  return {
    pinoHttp: {
      level: environment.LOG_LEVEL,
      redact: {
        paths: REDACTED_PATHS,
        censor: '[REDACTED]',
      },
    },
  };
}

export { REDACTED_PATHS };

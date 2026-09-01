import { REDACTED_PATHS, createLoggerOptions } from './logger.config';

describe('logger configuration', () => {
  it('redacts authentication credentials and application secrets', () => {
    const options = createLoggerOptions({
      NODE_ENV: 'test',
      PORT: '3001',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://axes:axes@localhost:5432/axes_crm',
    });

    expect(options.pinoHttp).toMatchObject({
      level: 'info',
      redact: {
        censor: '[REDACTED]',
      },
    });
    expect(REDACTED_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.token',
        'req.body.secret',
      ]),
    );
  });
});

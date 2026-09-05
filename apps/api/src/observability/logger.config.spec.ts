import { REDACTED_PATHS, createLoggerOptions } from "./logger.config";

describe("logger configuration", () => {
  it("does not depend on database configuration to initialize logging", () => {
    const options = createLoggerOptions({
      LOG_LEVEL: "info",
    });

    expect(options.pinoHttp).toMatchObject({
      level: "info",
      redact: {
        censor: "[REDACTED]",
      },
    });
  });

  it("redacts authentication credentials and application secrets", () => {
    expect(REDACTED_PATHS).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "req.body.password",
        "req.body.token",
        "req.body.secret",
      ])
    );
  });
});

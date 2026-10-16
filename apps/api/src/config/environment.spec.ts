import { buildCorsOrigins, parseApiEnvironment } from "./environment";

const secureEnvironment = {
  NODE_ENV: "test",
  PORT: "3001",
  DATABASE_URL: "postgresql://axes:axes@localhost:5432/axes_crm",
  APP_DATABASE_URL: "postgresql://axes_app:axes_app@localhost:5432/axes_crm",
  LOG_LEVEL: "info",
  JWT_ACCESS_SECRET: "test-access-secret-with-at-least-32-characters",
  REFRESH_TOKEN_PEPPER: "test-refresh-pepper-with-at-least-32-characters",
};

describe("parseApiEnvironment", () => {
  it("requires a private absolute directory and a canonical 32-byte backup key together", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    for (const invalid of [
      { BACKUP_DIRECTORY: "/var/lib/axes/backups" },
      { BACKUP_ENCRYPTION_KEY: key },
      { BACKUP_DIRECTORY: "relative", BACKUP_ENCRYPTION_KEY: key },
      { BACKUP_DIRECTORY: "/", BACKUP_ENCRYPTION_KEY: key },
      { BACKUP_DIRECTORY: "/app/public/backups", BACKUP_ENCRYPTION_KEY: key },
      {
        BACKUP_DIRECTORY: "/var/lib/axes/backups",
        BACKUP_ENCRYPTION_KEY: "short",
      },
      { BACKUP_MAX_BYTES: 0 },
    ])
      expect(() =>
        parseApiEnvironment({ ...secureEnvironment, ...invalid })
      ).toThrow();
    expect(
      parseApiEnvironment({
        ...secureEnvironment,
        BACKUP_DIRECTORY: "/var/lib/axes/backups",
        BACKUP_ENCRYPTION_KEY: key,
      })
    ).toMatchObject({
      BACKUP_DIRECTORY: "/var/lib/axes/backups",
      BACKUP_ENCRYPTION_KEY: key,
      BACKUP_MAX_BYTES: 67108864,
      BACKUP_SNAPSHOT_TIMEOUT_MS: 60000,
    });
  });
  it("treats blank backup settings as disabled and validates the worker poll interval", () => {
    expect(
      parseApiEnvironment({
        ...secureEnvironment,
        BACKUP_DIRECTORY: "",
        BACKUP_ENCRYPTION_KEY: "",
      })
    ).toMatchObject({
      BACKUP_WORKER_POLL_MS: 15000,
    });

    const configured = parseApiEnvironment({
      ...secureEnvironment,
      BACKUP_DIRECTORY: "/var/lib/axes/backups",
      BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      BACKUP_WORKER_POLL_MS: "2500",
    });
    expect(configured.BACKUP_WORKER_POLL_MS).toBe(2500);

    for (const invalid of ["999", "300001"]) {
      expect(() =>
        parseApiEnvironment({
          ...secureEnvironment,
          BACKUP_WORKER_POLL_MS: invalid,
        })
      ).toThrow("BACKUP_WORKER_POLL_MS");
    }
  });

  it("defaults webhooks to explicit opt-in and validates its polling interval", () => {
    expect(parseApiEnvironment(secureEnvironment)).toMatchObject({
      WEBHOOK_WORKER_ENABLED: false,
      WEBHOOK_WORKER_POLL_MS: 5000,
    });
    expect(
      parseApiEnvironment({
        ...secureEnvironment,
        WEBHOOK_WORKER_ENABLED: "true",
        WEBHOOK_WORKER_POLL_MS: "2500",
      })
    ).toMatchObject({
      WEBHOOK_WORKER_ENABLED: true,
      WEBHOOK_WORKER_POLL_MS: 2500,
    });
    for (const invalid of [
      { WEBHOOK_WORKER_ENABLED: "yes" },
      { WEBHOOK_WORKER_POLL_MS: "999" },
      { WEBHOOK_WORKER_POLL_MS: "300001" },
    ])
      expect(() =>
        parseApiEnvironment({ ...secureEnvironment, ...invalid })
      ).toThrow();
  });
  it("rejects a missing database URL", () => {
    expect(() =>
      parseApiEnvironment({
        ...secureEnvironment,
        DATABASE_URL: undefined,
      })
    ).toThrow("DATABASE_URL");
  });

  it("rejects a missing application database URL", () => {
    expect(() =>
      parseApiEnvironment({
        ...secureEnvironment,
        APP_DATABASE_URL: undefined,
      })
    ).toThrow("APP_DATABASE_URL");
  });

  it("rejects short authentication secrets", () => {
    expect(() =>
      parseApiEnvironment({
        ...secureEnvironment,
        JWT_ACCESS_SECRET: "short",
      })
    ).toThrow("JWT_ACCESS_SECRET");
  });

  it("parses the supported values", () => {
    expect(parseApiEnvironment(secureEnvironment)).toMatchObject({
      NODE_ENV: "test",
      PORT: 3001,
      DATABASE_URL: secureEnvironment.DATABASE_URL,
      APP_DATABASE_URL: secureEnvironment.APP_DATABASE_URL,
      LOG_LEVEL: "info",
      AUTH_ACCESS_TTL_SECONDS: 900,
      AUTH_REFRESH_TTL_SECONDS: 2592000,
    });
  });
});

describe("webhook encryption configuration", () => {
  it("requires a canonical base64 key of 32 bytes", () => {
    for (const invalid of [
      "bad",
      Buffer.alloc(31).toString("base64"),
      Buffer.alloc(32).toString("base64") + "\n",
    ])
      expect(() =>
        parseApiEnvironment({
          ...secureEnvironment,
          WEBHOOK_ENCRYPTION_KEY: invalid,
        })
      ).toThrow("WEBHOOK_ENCRYPTION_KEY");
    expect(
      parseApiEnvironment({ ...secureEnvironment, WEBHOOK_ENCRYPTION_KEY: "" })
    ).not.toHaveProperty("WEBHOOK_ENCRYPTION_KEY", "");
    const key = Buffer.alloc(32, 3).toString("base64");
    expect(
      parseApiEnvironment({ ...secureEnvironment, WEBHOOK_ENCRYPTION_KEY: key })
    ).toHaveProperty("WEBHOOK_ENCRYPTION_KEY", key);
  });
});

describe("OAuth client registry deployment settings", () => {
  const origin = "https://crm.example.com";
  const registrations = JSON.stringify({ version: 1, registrations: [] });

  it("requires both server configuration values together", () => {
    for (const patch of [
      { EMAIL_OAUTH_CALLBACK_ORIGIN: origin },
      { EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: registrations },
      {
        EMAIL_OAUTH_CALLBACK_ORIGIN: origin,
        EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: "",
      },
      {
        EMAIL_OAUTH_CALLBACK_ORIGIN: "",
        EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: registrations,
      },
      {
        EMAIL_OAUTH_CALLBACK_ORIGIN: origin,
        EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: "x".repeat(65537),
      },
    ]) {
      expect(() =>
        parseApiEnvironment({ ...secureEnvironment, ...patch })
      ).toThrow();
    }
  });

  it("is disabled by default and accepts paired values without enabling mail", () => {
    const baseline = parseApiEnvironment(secureEnvironment);
    expect(baseline.EMAIL_OAUTH_CALLBACK_ORIGIN).toBeUndefined();
    expect(baseline.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON).toBeUndefined();

    const environment = parseApiEnvironment({
      ...secureEnvironment,
      EMAIL_OAUTH_CALLBACK_ORIGIN: origin,
      EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: registrations,
    });
    expect(environment.EMAIL_OAUTH_CALLBACK_ORIGIN).toBe(origin);
    expect(environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON).toBe(
      registrations
    );
    expect(environment).not.toHaveProperty("EMAIL_SENDING_ENABLED");
  });
});

describe("buildCorsOrigins", () => {
  const webOrigin = "https://crm.example.com";

  it("uses WEB_ORIGIN when CORS_ORIGINS is undefined", () => {
    expect(buildCorsOrigins({ WEB_ORIGIN: webOrigin })).toEqual([webOrigin]);
  });

  it("splits configured origins, trims whitespace and removes empty entries", () => {
    const environment = parseApiEnvironment({
      ...secureEnvironment,
      WEB_ORIGIN: webOrigin,
      CORS_ORIGINS: " http://localhost:3000, ,http://127.0.0.1:3000, ",
    });
    expect(buildCorsOrigins(environment)).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
    expect(environment.WEB_ORIGIN).toBe(webOrigin);
  });

  it("keeps an explicitly empty list empty", () => {
    expect(
      buildCorsOrigins({ WEB_ORIGIN: webOrigin, CORS_ORIGINS: " , " })
    ).toEqual([]);
  });

  it("accepts a single production origin", () => {
    expect(
      buildCorsOrigins({ WEB_ORIGIN: webOrigin, CORS_ORIGINS: webOrigin })
    ).toEqual([webOrigin]);
  });

  it("continues to reject a list in WEB_ORIGIN", () => {
    expect(() =>
      parseApiEnvironment({
        ...secureEnvironment,
        WEB_ORIGIN: "http://localhost:3000,http://127.0.0.1:3000",
      })
    ).toThrow("WEB_ORIGIN");
  });
});

import { parseApiEnvironment } from "./environment";

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

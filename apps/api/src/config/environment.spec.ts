import { parseApiEnvironment } from "./environment";

const secureEnvironment = {
  NODE_ENV: "test",
  PORT: "3001",
  DATABASE_URL: "postgresql://axes:axes@localhost:5432/axes_crm",
  APP_DATABASE_URL:
    "postgresql://axes_app:axes_app@localhost:5432/axes_crm",
  LOG_LEVEL: "info",
  JWT_ACCESS_SECRET: "test-access-secret-with-at-least-32-characters",
  REFRESH_TOKEN_PEPPER: "test-refresh-pepper-with-at-least-32-characters",
};

describe("parseApiEnvironment", () => {
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

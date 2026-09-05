import { parseApiEnvironment } from "./environment";

describe("parseApiEnvironment", () => {
  it("rejects a missing database URL", () => {
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "test",
        PORT: "3001",
      })
    ).toThrow("DATABASE_URL");
  });

  it("parses the supported values", () => {
    expect(
      parseApiEnvironment({
        NODE_ENV: "test",
        PORT: "3001",
        DATABASE_URL: "postgresql://axes:axes@localhost:5432/axes_crm",
        LOG_LEVEL: "info",
      })
    ).toMatchObject({
      NODE_ENV: "test",
      PORT: 3001,
      LOG_LEVEL: "info",
    });
  });
});

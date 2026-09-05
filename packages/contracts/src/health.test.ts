import { describe, expect, it } from "vitest";

import { createHealthResponse, HealthResponseSchema } from "./health";

describe("health contract", () => {
  it("creates and validates the process health response", () => {
    const response = createHealthResponse("api");

    expect(response).toEqual({
      status: "ok",
      service: "api",
    });
    expect(HealthResponseSchema.parse(response)).toEqual(response);
  });

  it("includes database readiness when available", () => {
    const response = createHealthResponse("api", "up");

    expect(response).toEqual({
      status: "ok",
      service: "api",
      database: "up",
    });
    expect(HealthResponseSchema.parse(response)).toEqual(response);
  });
});

import { describe, expect, it } from "vitest";

import { ManagementSummarySchema } from "./management-summary";

const validSummary = {
  asOf: "2026-09-12T12:00:00.000Z",
  opportunitiesByStage: [
    {
      pipelineId: "11111111-1111-4111-8111-111111111111",
      pipelineName: "Comercial",
      stageId: "22222222-2222-4222-8222-222222222222",
      stageName: "Qualificação",
      count: 3,
    },
  ],
  openEstimatedValue: "12345678901234567890.30",
  pendingActivities: 4,
  overdueActivities: 1,
  undatedActivities: 1,
};

describe("ManagementSummarySchema", () => {
  it("accepts the management summary wire contract", () => {
    expect(ManagementSummarySchema.parse(validSummary)).toEqual(validSummary);
  });

  it("rejects numeric or malformed decimal values", () => {
    expect(() =>
      ManagementSummarySchema.parse({
        ...validSummary,
        openEstimatedValue: 0.3,
      })
    ).toThrow();
    expect(() =>
      ManagementSummarySchema.parse({
        ...validSummary,
        openEstimatedValue: "0.3",
      })
    ).toThrow();
  });

  it("rejects invalid timestamps and negative or fractional counts", () => {
    expect(() =>
      ManagementSummarySchema.parse({ ...validSummary, asOf: "not-a-date" })
    ).toThrow();
    expect(() =>
      ManagementSummarySchema.parse({ ...validSummary, pendingActivities: -1 })
    ).toThrow();
    expect(() =>
      ManagementSummarySchema.parse({
        ...validSummary,
        opportunitiesByStage: [
          { ...validSummary.opportunitiesByStage[0], count: 1.5 },
        ],
      })
    ).toThrow();
  });
});

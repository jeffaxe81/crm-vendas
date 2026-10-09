import {
  opportunityAgeDays,
  summarizeOpportunityAges,
} from "./opportunity-age";

describe("C6-02 opportunity aging", () => {
  const asOf = new Date("2026-10-09T12:00:00.000Z");

  it("measures age since creation", () => {
    expect(opportunityAgeDays(new Date("2026-10-07T12:00:00.000Z"), asOf)).toBe(2);
  });

  it("clamps future timestamps to zero", () => {
    expect(opportunityAgeDays(new Date("2026-10-10T12:00:00.000Z"), asOf)).toBe(0);
  });

  it("aggregates age by stage without confusing age with stage dwell time", () => {
    const result = summarizeOpportunityAges(
      [
        { stageId: "a", createdAt: new Date("2026-10-01T12:00:00.000Z") },
        { stageId: "a", createdAt: new Date("2026-10-05T12:00:00.000Z") },
        { stageId: "b", createdAt: new Date("2026-10-08T12:00:00.000Z") },
      ],
      asOf
    );
    expect(result).toEqual([
      { stageId: "a", opportunities: 2, averageDays: 6, oldestDays: 8 },
      { stageId: "b", opportunities: 1, averageDays: 1, oldestDays: 1 },
    ]);
  });

  it("returns no buckets for empty input", () => {
    expect(summarizeOpportunityAges([], asOf)).toEqual([]);
  });
});

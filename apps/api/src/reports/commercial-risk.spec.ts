import { evaluateCommercialRisk } from "./commercial-risk";

describe("C6-03 commercial risk signals", () => {
  const asOf = new Date("2026-10-09T12:00:00.000Z");
  const base = {
    id: "deal-1",
    title: "Negociação A",
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    updatedAt: new Date("2026-10-08T12:00:00.000Z"),
    lastActivityAt: null,
  };

  it("detects lack of activity separately from stale opportunity", () => {
    expect(evaluateCommercialRisk(base, asOf).signals).toEqual(["NO_ACTIVITY"]);
  });

  it("detects both risks when neither activity nor record changed", () => {
    const risk = evaluateCommercialRisk(
      { ...base, updatedAt: base.createdAt },
      asOf
    );
    expect(risk.signals).toEqual(["NO_ACTIVITY", "STALE_OPPORTUNITY"]);
    expect(risk.severity).toBe("HIGH");
  });

  it("does not alert at the exact threshold", () => {
    const sevenDaysAgo = new Date("2026-10-02T12:00:00.000Z");
    const risk = evaluateCommercialRisk(
      {
        ...base,
        updatedAt: sevenDaysAgo,
        lastActivityAt: sevenDaysAgo,
      },
      asOf
    );
    expect(risk.signals).toEqual([]);
  });
});

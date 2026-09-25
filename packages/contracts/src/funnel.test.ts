import { describe, expect, it } from "vitest";

import { FunnelQuerySchema, FunnelReportSchema } from "./funnel";

const pipelineId = "33333333-3333-4333-8333-333333333333";

const validReport = {
  asOf: "2026-09-25T12:00:00.000Z",
  filters: {
    pipelineId,
    from: "2026-09-01T00:00:00.000Z",
    to: null,
    ownerUserId: null,
  },
  pipeline: { id: pipelineId, name: "Funil comercial", isActive: true },
  stages: [
    {
      stageId: "11111111-1111-4111-8111-111111111111",
      name: "Proposta",
      kind: "OPEN",
      position: 1,
      opportunities: 2,
      value: "3000.00",
    },
    {
      stageId: "22222222-2222-4222-8222-222222222222",
      name: "Ganho",
      kind: "WON",
      position: 2,
      opportunities: 1,
      value: "1000.50",
    },
  ],
  inactiveStages: { opportunities: 0, value: "0.00" },
  totals: { opportunities: 3, value: "4000.50" },
  indicators: {
    openOpportunities: 2,
    wonOpportunities: 1,
    lostOpportunities: 0,
    winRate: "100.00",
    openValue: "3000.00",
    wonValue: "1000.50",
    lostValue: "0.00",
    averageWonTicket: "1000.50",
  },
};

describe("FunnelQuerySchema", () => {
  it("requires pipelineId and accepts the optional filters", () => {
    expect(FunnelQuerySchema.safeParse({}).success).toBe(false);
    expect(FunnelQuerySchema.parse({ pipelineId })).toEqual({ pipelineId });
    expect(
      FunnelQuerySchema.parse({
        pipelineId,
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999-03:00",
        ownerUserId: "44444444-4444-4444-8444-444444444444",
      })
    ).toMatchObject({ pipelineId, from: "2026-09-01T00:00:00.000Z" });
  });

  it("rejects unknown keys, invalid ids, invalid dates and inverted ranges", () => {
    for (const query of [
      { pipelineId, organizationId: pipelineId },
      { pipelineId: "abc" },
      { pipelineId, ownerUserId: "123" },
      { pipelineId, from: "2026-09-01" },
      {
        pipelineId,
        from: "2026-09-30T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      },
    ]) {
      expect(FunnelQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe("FunnelReportSchema", () => {
  it("accepts the funnel wire contract, including null ratios", () => {
    expect(FunnelReportSchema.parse(validReport)).toEqual(validReport);
    const noClosed = {
      ...validReport,
      indicators: {
        ...validReport.indicators,
        winRate: null,
        averageWonTicket: null,
      },
    };
    expect(FunnelReportSchema.parse(noClosed)).toEqual(noClosed);
  });

  it("rejects numeric or malformed money, rates and stage kinds", () => {
    const withIndicators = (patch: Record<string, unknown>) => ({
      ...validReport,
      indicators: { ...validReport.indicators, ...patch },
    });
    for (const patch of [
      { winRate: 66.67 },
      { winRate: "66.7" },
      { winRate: "100.01" },
      { winRate: "101.00" },
      { wonValue: 1000.5 },
      { averageWonTicket: "1000.5" },
      { lostOpportunities: -1 },
    ]) {
      expect(() => FunnelReportSchema.parse(withIndicators(patch))).toThrow();
    }
    expect(() =>
      FunnelReportSchema.parse({
        ...validReport,
        stages: [{ ...validReport.stages[0], kind: "CLOSED" }],
      })
    ).toThrow();
    expect(
      FunnelReportSchema.safeParse(withIndicators({ winRate: "0.00" })).success
    ).toBe(true);
  });
});

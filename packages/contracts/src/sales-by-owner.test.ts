import { describe, expect, it } from "vitest";

import {
  SalesByOwnerQuerySchema,
  SalesByOwnerReportSchema,
} from "./sales-by-owner";

const bucket = { opportunities: 2, value: "1500.00" };
const empty = { opportunities: 0, value: "0.00" };

const validReport = {
  asOf: "2026-09-25T12:00:00.000Z",
  filters: { from: null, to: null, pipelineId: null },
  items: [
    {
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      ownerName: "Ana Vendas",
      ownerActive: true,
      open: empty,
      won: bucket,
      lost: empty,
      total: bucket,
      winRate: "100.0",
    },
  ],
  totals: {
    open: empty,
    won: bucket,
    lost: empty,
    total: bucket,
    winRate: "100.0",
  },
};

describe("SalesByOwnerQuerySchema", () => {
  it("accepts an empty query and all optional filters", () => {
    expect(SalesByOwnerQuerySchema.parse({})).toEqual({});
    expect(
      SalesByOwnerQuerySchema.parse({
        from: "2026-09-01T00:00:00.000-03:00",
        to: "2026-09-30T23:59:59.999-03:00",
        pipelineId: "22222222-2222-4222-8222-222222222222",
      })
    ).toMatchObject({ pipelineId: "22222222-2222-4222-8222-222222222222" });
  });

  it("rejects unknown keys, owner filter, dates without offset and inverted periods", () => {
    for (const query of [
      { organizationId: "22222222-2222-4222-8222-222222222222" },
      { ownerUserId: "22222222-2222-4222-8222-222222222222" },
      { from: "2026-09-01" },
      { pipelineId: "x" },
      { from: "2026-09-30T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
    ]) {
      expect(SalesByOwnerQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe("SalesByOwnerReportSchema", () => {
  it("accepts a valid report and a null win rate", () => {
    expect(SalesByOwnerReportSchema.parse(validReport)).toEqual(validReport);
    expect(
      SalesByOwnerReportSchema.safeParse({
        ...validReport,
        totals: { ...validReport.totals, winRate: null },
      }).success
    ).toBe(true);
  });

  it("rejects floating point money and malformed win rates", () => {
    expect(
      SalesByOwnerReportSchema.safeParse({
        ...validReport,
        totals: {
          ...validReport.totals,
          won: { opportunities: 1, value: "10.5" },
        },
      }).success
    ).toBe(false);
    for (const winRate of ["66.67", "66", "1000.0", "-1.0"]) {
      expect(
        SalesByOwnerReportSchema.safeParse({
          ...validReport,
          totals: { ...validReport.totals, winRate },
        }).success
      ).toBe(false);
    }
  });
});

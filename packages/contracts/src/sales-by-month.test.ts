import { describe, expect, it } from "vitest";

import {
  SalesByMonthQuerySchema,
  SalesByMonthReportSchema,
} from "./sales-by-month";

const bucket = { opportunities: 2, value: "1500.00" };
const empty = { opportunities: 0, value: "0.00" };

const validReport = {
  asOf: "2026-09-25T12:00:00.000Z",
  filters: { year: 2026, pipelineId: null },
  items: [
    {
      month: 9,
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

describe("SalesByMonthQuerySchema", () => {
  it("requires a year and accepts an optional pipeline filter", () => {
    expect(SalesByMonthQuerySchema.parse({ year: 2026 })).toEqual({
      year: 2026,
    });
    expect(
      SalesByMonthQuerySchema.parse({
        year: "2026",
        pipelineId: "22222222-2222-4222-8222-222222222222",
      })
    ).toEqual({
      year: 2026,
      pipelineId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("rejects a missing/out-of-range year, unknown keys and an invalid pipeline id", () => {
    for (const query of [
      {},
      { year: 1999 },
      { year: 2101 },
      { year: 2026, from: "2026-01-01" },
      { year: 2026, pipelineId: "x" },
    ]) {
      expect(SalesByMonthQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe("SalesByMonthReportSchema", () => {
  it("accepts a valid report and a null win rate", () => {
    expect(SalesByMonthReportSchema.parse(validReport)).toEqual(validReport);
    expect(
      SalesByMonthReportSchema.safeParse({
        ...validReport,
        totals: { ...validReport.totals, winRate: null },
      }).success
    ).toBe(true);
  });

  it("rejects months outside 1-12 and floating point money", () => {
    expect(
      SalesByMonthReportSchema.safeParse({
        ...validReport,
        items: [{ ...validReport.items[0], month: 13 }],
      }).success
    ).toBe(false);
    expect(
      SalesByMonthReportSchema.safeParse({
        ...validReport,
        totals: {
          ...validReport.totals,
          won: { opportunities: 1, value: "10.5" },
        },
      }).success
    ).toBe(false);
  });
});

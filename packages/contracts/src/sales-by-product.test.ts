import { describe, expect, it } from "vitest";

import {
  SalesByProductQuerySchema,
  SalesByProductReportSchema,
} from "./sales-by-product";

const bucket = { quantity: "2.500", opportunities: 1, value: "1500.00" };
const empty = { quantity: "0.000", opportunities: 0, value: "0.00" };

const validReport = {
  asOf: "2026-09-23T12:00:00.000Z",
  filters: {
    from: "2026-09-01T00:00:00.000Z",
    to: null,
    pipelineId: null,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
  },
  items: [
    {
      productId: "22222222-2222-4222-8222-222222222222",
      productCode: "LIC",
      productName: "Licença PABX",
      productActive: true,
      productDeleted: false,
      open: empty,
      won: bucket,
      lost: empty,
      total: bucket,
    },
  ],
  totals: { open: empty, won: bucket, lost: empty, total: bucket },
};

describe("SalesByProductQuerySchema", () => {
  it("accepts an empty query and all optional filters", () => {
    expect(SalesByProductQuerySchema.parse({})).toEqual({});
    expect(
      SalesByProductQuerySchema.parse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999-03:00",
        pipelineId: "33333333-3333-4333-8333-333333333333",
        ownerUserId: "44444444-4444-4444-8444-444444444444",
      })
    ).toMatchObject({ from: "2026-09-01T00:00:00.000Z" });
  });

  it("rejects unknown keys, invalid ids, invalid dates and inverted ranges", () => {
    expect(
      SalesByProductQuerySchema.safeParse({ organizationId: "x" }).success
    ).toBe(false);
    expect(
      SalesByProductQuerySchema.safeParse({ pipelineId: "abc" }).success
    ).toBe(false);
    expect(
      SalesByProductQuerySchema.safeParse({ from: "2026-09-01" }).success
    ).toBe(false);
    expect(
      SalesByProductQuerySchema.safeParse({
        from: "2026-09-30T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }).success
    ).toBe(false);
  });
});

describe("SalesByProductReportSchema", () => {
  it("accepts the sales by product wire contract", () => {
    expect(SalesByProductReportSchema.parse(validReport)).toEqual(validReport);
  });

  it("rejects numeric or malformed money and quantity values", () => {
    const withTotal = (total: unknown) => ({
      ...validReport,
      totals: { ...validReport.totals, total },
    });
    expect(() =>
      SalesByProductReportSchema.parse(withTotal({ ...bucket, value: 1500 }))
    ).toThrow();
    expect(() =>
      SalesByProductReportSchema.parse(withTotal({ ...bucket, value: "1.5" }))
    ).toThrow();
    expect(() =>
      SalesByProductReportSchema.parse(
        withTotal({ ...bucket, quantity: "2.5" })
      )
    ).toThrow();
    expect(() =>
      SalesByProductReportSchema.parse(
        withTotal({ ...bucket, opportunities: -1 })
      )
    ).toThrow();
  });
});

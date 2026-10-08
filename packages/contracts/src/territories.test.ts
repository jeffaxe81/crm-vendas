import { describe, expect, it } from "vitest";

import { TerritoryQuotaInputSchema } from "./territories";

describe("TerritoryQuotaInputSchema", () => {
  it("requires a concrete month for monthly quotas", () => {
    expect(
      TerritoryQuotaInputSchema.safeParse({
        period: "MONTH",
        year: 2026,
        amount: 1000,
      }).success
    ).toBe(false);

    expect(
      TerritoryQuotaInputSchema.safeParse({
        period: "MONTH",
        year: 2026,
        periodIndex: 2,
        amount: 1000,
      }).success
    ).toBe(true);
  });

  it("requires a quarter between 1 and 4", () => {
    expect(
      TerritoryQuotaInputSchema.safeParse({
        period: "QUARTER",
        year: 2026,
        periodIndex: 5,
        amount: 1000,
      }).success
    ).toBe(false);

    expect(
      TerritoryQuotaInputSchema.safeParse({
        period: "QUARTER",
        year: 2026,
        periodIndex: 4,
        amount: 1000,
      }).success
    ).toBe(true);
  });

  it("keeps annual quotas without subdivision", () => {
    expect(
      TerritoryQuotaInputSchema.safeParse({
        period: "YEAR",
        year: 2026,
        amount: 1000,
      }).success
    ).toBe(true);

    expect(
      TerritoryQuotaInputSchema.safeParse({
        period: "YEAR",
        year: 2026,
        periodIndex: 2,
        amount: 1000,
      }).success
    ).toBe(false);
  });
});

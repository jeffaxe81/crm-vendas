import { describe, expect, it } from "vitest";

import { SalesByProductOwnersSchema } from "./sales-by-product-filters";

describe("C4.4.1 sales by product owners contract", () => {
  it("accepts owners with id, display name and membership state", () => {
    expect(
      SalesByProductOwnersSchema.parse([
        {
          userId: "11111111-1111-4111-8111-111111111111",
          displayName: "Ana Vendas",
          membershipActive: false,
        },
      ])
    ).toHaveLength(1);
  });

  it("rejects invalid user ids and missing fields", () => {
    expect(
      SalesByProductOwnersSchema.safeParse([
        { userId: "123", displayName: "Ana", membershipActive: true },
      ]).success
    ).toBe(false);
    expect(
      SalesByProductOwnersSchema.safeParse([
        { userId: "11111111-1111-4111-8111-111111111111" },
      ]).success
    ).toBe(false);
  });
});

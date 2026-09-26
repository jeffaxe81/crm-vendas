import { describe, expect, it } from "vitest";

import {
  OpportunityItemCreateInputSchema,
  ProductCreateInputSchema,
  calculateLineTotalCents,
  formatCents,
} from "./products";

const total = (quantity: string, unitPrice: string, discountPercent = "0") =>
  formatCents(
    calculateLineTotalCents({ quantity, unitPrice, discountPercent })
  );

describe("C4.3 line total", () => {
  it("multiplies quantity, price and discount exactly", () => {
    expect(total("10", "100.00", "12.5")).toBe("875.00");
    expect(total("3.5", "100")).toBe("350.00");
    expect(total("1", "2500.00", "100")).toBe("0.00");
    expect(total("0.001", "0.01")).toBe("0.00");
  });

  it("rounds half-up to cents", () => {
    // 1 × 0.05 × 0.5 = 0.025 → 0.03
    expect(total("1", "0.05", "50")).toBe("0.03");
    // 3 × 3.33 × 0.9 = 8.991 → 8.99
    expect(total("3", "3.33", "10")).toBe("8.99");
  });

  it("handles large values without floating point error", () => {
    expect(total("1000", "99999999999.99")).toBe("99999999999990.00");
    expect(total("0.333", "0.10")).toBe("0.03");
  });
});

describe("C4.3 schemas", () => {
  it("defaults product to active and rejects negative price", () => {
    expect(
      ProductCreateInputSchema.parse({ code: "A", name: "B", unitPrice: "1" })
        .isActive
    ).toBe(true);
    expect(
      ProductCreateInputSchema.safeParse({
        code: "A",
        name: "B",
        unitPrice: "-1",
      }).success
    ).toBe(false);
  });

  it("validates item quantity and discount bounds", () => {
    const base = {
      productId: "3f1e5c2a-9d6b-4c3e-8f7a-1b2c3d4e5f60",
      version: 1,
    };
    expect(
      OpportunityItemCreateInputSchema.parse({ ...base, quantity: "1" })
        .discountPercent
    ).toBe("0");
    for (const invalid of [
      { quantity: "0" },
      { quantity: "1.0001" },
      { quantity: "1", discountPercent: "100.5" },
      { quantity: "1", discountPercent: "-1" },
    ]) {
      expect(
        OpportunityItemCreateInputSchema.safeParse({ ...base, ...invalid })
          .success
      ).toBe(false);
    }
  });
});

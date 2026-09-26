import { winRate } from "./sales-by-owner.service";

describe("winRate", () => {
  it("returns null without closed opportunities", () => {
    expect(winRate(0, 0)).toBeNull();
  });

  it("rounds half up to one decimal place", () => {
    expect(winRate(1, 0)).toBe("100.0");
    expect(winRate(0, 3)).toBe("0.0");
    expect(winRate(1, 2)).toBe("33.3");
    expect(winRate(2, 1)).toBe("66.7");
    expect(winRate(1, 7)).toBe("12.5");
    expect(winRate(1, 15)).toBe("6.3");
  });
});

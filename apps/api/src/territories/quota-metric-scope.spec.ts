import { selectMetricQuotas } from "./quota-metric-scope";

describe("quota metric legacy policy", () => {
  it("excludes ambiguous legacy totals once indexed quotas exist", () => {
    const legacy = { periodIndex: 0, amount: 1000, actual: 500 };
    const january = { periodIndex: 1, amount: 1000, actual: 1000 };
    expect(selectMetricQuotas([legacy, january])).toEqual([january]);
  });

  it("preserves legacy totals when no indexed quota exists", () => {
    const legacy = { periodIndex: 0, amount: 1000, actual: 500 };
    expect(selectMetricQuotas([legacy])).toEqual([legacy]);
    expect(selectMetricQuotas([])).toEqual([]);
  });
});

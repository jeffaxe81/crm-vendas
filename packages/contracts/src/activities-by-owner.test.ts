import { describe, expect, it } from "vitest";

import {
  ActivitiesByOwnerQuerySchema,
  ActivitiesByOwnerReportSchema,
} from "./activities-by-owner";

const counts = {
  total: 4,
  completed: 2,
  pending: 1,
  cancelled: 1,
  overdue: 1,
  completedOnTime: 1,
  completionRate: 0.5,
  byType: { TASK: 3, APPOINTMENT: 1 },
};

const validReport = {
  asOf: "2026-09-23T12:00:00.000Z",
  filters: { from: "2026-09-01T00:00:00.000Z", to: null, type: "TASK" },
  items: [
    {
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      ownerDisplayName: "Ana Vendas",
      ownerActive: true,
      ...counts,
    },
  ],
  totals: counts,
};

describe("ActivitiesByOwnerQuerySchema", () => {
  it("accepts an empty query and all optional filters", () => {
    expect(ActivitiesByOwnerQuerySchema.parse({})).toEqual({});
    expect(
      ActivitiesByOwnerQuerySchema.parse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999-03:00",
        type: "APPOINTMENT",
      })
    ).toMatchObject({ type: "APPOINTMENT" });
  });

  it("rejects unknown keys, invalid types, invalid dates and inverted ranges", () => {
    expect(
      ActivitiesByOwnerQuerySchema.safeParse({ organizationId: "x" }).success
    ).toBe(false);
    expect(
      ActivitiesByOwnerQuerySchema.safeParse({ ownerUserId: "x" }).success
    ).toBe(false);
    expect(
      ActivitiesByOwnerQuerySchema.safeParse({ type: "CALL" }).success
    ).toBe(false);
    expect(
      ActivitiesByOwnerQuerySchema.safeParse({ from: "2026-09-01" }).success
    ).toBe(false);
    expect(
      ActivitiesByOwnerQuerySchema.safeParse({
        from: "2026-09-30T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }).success
    ).toBe(false);
  });
});

describe("ActivitiesByOwnerReportSchema", () => {
  it("accepts the activities by owner wire contract", () => {
    expect(ActivitiesByOwnerReportSchema.parse(validReport)).toEqual(
      validReport
    );
  });

  it("accepts a null completion rate and rejects invalid counts and rates", () => {
    const withTotals = (totals: unknown) => ({ ...validReport, totals });
    expect(() =>
      ActivitiesByOwnerReportSchema.parse(
        withTotals({
          ...counts,
          total: 0,
          completed: 0,
          pending: 0,
          cancelled: 0,
          overdue: 0,
          completedOnTime: 0,
          completionRate: null,
          byType: { TASK: 0, APPOINTMENT: 0 },
        })
      )
    ).not.toThrow();
    expect(() =>
      ActivitiesByOwnerReportSchema.parse(
        withTotals({ ...counts, completionRate: 1.5 })
      )
    ).toThrow();
    expect(() =>
      ActivitiesByOwnerReportSchema.parse(withTotals({ ...counts, total: -1 }))
    ).toThrow();
    expect(() =>
      ActivitiesByOwnerReportSchema.parse(
        withTotals({ ...counts, overdue: 1.2 })
      )
    ).toThrow();
    expect(() =>
      ActivitiesByOwnerReportSchema.parse({
        ...validReport,
        items: [{ ...validReport.items[0], ownerUserId: "abc" }],
      })
    ).toThrow();
  });
});

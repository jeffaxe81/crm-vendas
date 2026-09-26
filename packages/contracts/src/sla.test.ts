import { describe, expect, it } from "vitest";

import {
  SlaPolicyUpsertInputSchema,
  SlaReportQuerySchema,
  SlaReportSchema,
  computeSlaState,
  computeTicketSla,
  slaDueAt,
} from "./sla";

const start = new Date("2026-09-26T12:00:00.000Z");
// Prazo de 100 minutos: 20% = 20 minutos.
const due = new Date("2026-09-26T13:40:00.000Z");
const minutes = (value: number) => new Date(start.getTime() + value * 60_000);

describe("C5.3 SLA state", () => {
  it("returns null without a deadline", () => {
    expect(
      computeSlaState({
        startAt: start,
        dueAt: null,
        completedAt: null,
        now: start,
      })
    ).toBeNull();
  });

  it("is OK with exactly 20% remaining and AT_RISK just below", () => {
    const base = { startAt: start, dueAt: due, completedAt: null };
    expect(computeSlaState({ ...base, now: minutes(0) })).toBe("OK");
    expect(computeSlaState({ ...base, now: minutes(80) })).toBe("OK");
    expect(
      computeSlaState({ ...base, now: new Date(minutes(80).getTime() + 1) })
    ).toBe("AT_RISK");
    expect(computeSlaState({ ...base, now: minutes(99) })).toBe("AT_RISK");
  });

  it("is AT_RISK at the exact deadline and BREACHED right after", () => {
    const base = { startAt: start, dueAt: due, completedAt: null };
    expect(computeSlaState({ ...base, now: due })).toBe("AT_RISK");
    expect(computeSlaState({ ...base, now: new Date(due.getTime() + 1) })).toBe(
      "BREACHED"
    );
  });

  it("is MET when completed exactly at the deadline and MISSED after", () => {
    const base = { startAt: start, dueAt: due, now: minutes(500) };
    expect(computeSlaState({ ...base, completedAt: due })).toBe("MET");
    expect(computeSlaState({ ...base, completedAt: minutes(10) })).toBe("MET");
    expect(
      computeSlaState({
        ...base,
        completedAt: new Date(due.getTime() + 1),
      })
    ).toBe("MISSED");
  });

  it("accepts ISO strings and derives both ticket states", () => {
    const ticket = {
      status: "IN_PROGRESS" as const,
      openedAt: start.toISOString(),
      firstResponseAt: minutes(5).toISOString(),
      resolvedAt: null,
      firstResponseDueAt: minutes(30).toISOString(),
      resolutionDueAt: due.toISOString(),
    };
    expect(computeTicketSla(ticket, minutes(200).toISOString())).toEqual({
      firstResponse: "MET",
      resolution: "BREACHED",
    });
    expect(
      computeTicketSla({ ...ticket, status: "CANCELLED" }, minutes(200))
    ).toEqual({ firstResponse: "MET", resolution: null });
  });

  it("computes deadlines in calendar minutes from openedAt", () => {
    expect(slaDueAt(start, 1440).toISOString()).toBe(
      "2026-09-27T12:00:00.000Z"
    );
  });
});

describe("C5.3 SLA contracts", () => {
  it("validates policy minutes and ordering", () => {
    expect(
      SlaPolicyUpsertInputSchema.parse({
        firstResponseMinutes: 30,
        resolutionMinutes: 240,
      })
    ).toEqual({
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
      isActive: true,
    });
    for (const invalid of [
      { firstResponseMinutes: 0, resolutionMinutes: 10 },
      { firstResponseMinutes: 1.5, resolutionMinutes: 10 },
      { firstResponseMinutes: 60, resolutionMinutes: 30 },
      { firstResponseMinutes: 10, resolutionMinutes: 20, extra: true },
      { firstResponseMinutes: 10, resolutionMinutes: 20, version: 0 },
    ]) {
      expect(SlaPolicyUpsertInputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("validates report query and shape", () => {
    expect(
      SlaReportQuerySchema.safeParse({
        from: "2026-09-02T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
      }).success
    ).toBe(false);
    expect(SlaReportQuerySchema.safeParse({ priority: "LOW" }).success).toBe(
      false
    );
    const counts = {
      opened: 1,
      firstResponseEvaluated: 1,
      firstResponseOnTime: 1,
      firstResponseRate: 1,
      resolutionEvaluated: 0,
      resolutionOnTime: 0,
      resolutionRate: null,
      breachedOpen: 0,
    };
    expect(
      SlaReportSchema.safeParse({
        asOf: "2026-09-26T12:00:00.000Z",
        filters: { from: null, to: null },
        items: [{ priority: "HIGH", ...counts }],
        totals: counts,
      }).success
    ).toBe(true);
  });
});

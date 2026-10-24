import { describe, expect, it } from "vitest";

import {
  compareDashboardVolumes,
  dashboardVolumeCsv,
} from "./dashboard-volume-insights";

const snapshot = {
  asOf: "2026-10-17T16:00:00.000Z",
  counts: { companies: 2, contacts: 3, opportunities: 1, activities: 4 },
  totalActiveRecords: 10,
  thresholds: { warning: 800, critical: 1000 },
  level: "normal" as const,
  queryDurationMs: 12,
};

describe("Read-only dashboard insights", () => {
  it("compares only two chronologically valid snapshots", () => {
    const comparison = compareDashboardVolumes(snapshot, {
      ...snapshot,
      asOf: "2026-10-17T17:30:00.000Z",
      counts: { companies: 3, contacts: 3, opportunities: 0, activities: 5 },
      totalActiveRecords: 11,
    });
    expect(comparison).toEqual({
      elapsedSeconds: 5400,
      totalDelta: 1,
      delta: { companies: 1, contacts: 0, opportunities: -1, activities: 1 },
    });
    expect(compareDashboardVolumes(snapshot, snapshot)).toBeNull();
    expect(
      compareDashboardVolumes(
        {
          ...snapshot,
          asOf: "2026-10-18T16:00:00.000Z",
        },
        snapshot
      )
    ).toBeNull();
  });

  it("rejects malformed metric payloads rather than exporting them", () => {
    expect(() =>
      dashboardVolumeCsv({
        ...snapshot,
        counts: { ...snapshot.counts, companies: -1 },
      })
    ).toThrow();
  });

  it("exports an aggregate-only deterministic CSV with no tenant metadata", () => {
    const csv = dashboardVolumeCsv(snapshot);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Empresas ativas";"2"');
    expect(csv).toContain('"Total de registros ativos";"10"');
    expect(csv).toContain('"2026-10-17T16:00:00.000Z"');
    expect(csv).toHaveLength(csv.length);
    expect(csv).not.toMatch(/accessToken|organizationId|userId|tenant/i);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(7);
  });
});

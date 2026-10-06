import { nextBackupRun, validateSchedule } from "./backup-schedule";

const daily = {
  frequency: "DAILY" as const,
  localTime: "02:00",
  weekday: 0,
  intervalMinutes: null,
  retentionCount: 15,
  timezone: "America/Sao_Paulo" as const,
};

describe("backup calendar", () => {
  it("uses São Paulo midnight boundaries, not UTC calendar dates", () => {
    expect(
      nextBackupRun(daily, new Date("2026-10-05T04:59:00Z")).toISOString()
    ).toBe("2026-10-05T05:00:00.000Z");
    expect(
      nextBackupRun(daily, new Date("2026-10-05T05:00:00Z")).toISOString()
    ).toBe("2026-10-06T05:00:00.000Z");
  });
  it("selects the next requested local weekday", () => {
    expect(
      nextBackupRun(
        { ...daily, frequency: "WEEKLY", weekday: 1 },
        new Date("2026-10-05T05:00:00Z")
      ).toISOString()
    ).toBe("2026-10-12T05:00:00.000Z");
  });
  it("uses elapsed minutes across local date boundaries for interval schedules", () => {
    expect(
      nextBackupRun(
        { ...daily, frequency: "INTERVAL", intervalMinutes: 90 },
        new Date("2026-10-05T23:45:12Z")
      ).toISOString()
    ).toBe("2026-10-06T01:15:12.000Z");
  });
  it("accepts exactly the supported retention counts", () => {
    for (const retentionCount of [7, 15, 30, 90])
      expect(() =>
        validateSchedule({ ...daily, retentionCount })
      ).not.toThrow();
    for (const retentionCount of [0, 1, 8, 100, 15.5])
      expect(() => validateSchedule({ ...daily, retentionCount })).toThrow();
  });
  it("rejects invalid calendar inputs instead of silently normalizing them", () => {
    for (const patch of [
      { timezone: "UTC" },
      { frequency: "MONTHLY" },
      { localTime: "24:00" },
      { localTime: "2:00" },
      { weekday: 7 },
      { weekday: 1.5 },
      { frequency: "INTERVAL", intervalMinutes: null },
      { frequency: "INTERVAL", intervalMinutes: 0 },
      { frequency: "INTERVAL", intervalMinutes: 525601 },
      { frequency: "DAILY", intervalMinutes: 30 },
    ])
      expect(() => validateSchedule({ ...daily, ...patch })).toThrow();
    expect(() => nextBackupRun(daily, new Date(NaN))).toThrow();
  });
  it("honors historical daylight-saving offsets from the timezone database", () => {
    expect(
      nextBackupRun(
        { ...daily, localTime: "03:00" },
        new Date("2018-12-01T04:30:00Z")
      ).toISOString()
    ).toBe("2018-12-01T05:00:00.000Z");
  });
});

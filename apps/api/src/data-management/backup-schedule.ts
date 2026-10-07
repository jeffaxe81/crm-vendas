import { z } from "zod";

const ScheduleSchema = z
  .object({
    frequency: z.enum(["DAILY", "WEEKLY", "INTERVAL"]),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    weekday: z.number().int().min(0).max(6),
    intervalMinutes: z.number().int().min(1).max(525600).nullable(),
    retentionCount: z.union([
      z.literal(7),
      z.literal(15),
      z.literal(30),
      z.literal(90),
    ]),
    timezone: z.literal("America/Sao_Paulo"),
  })
  .strict()
  .refine(value =>
    value.frequency === "INTERVAL"
      ? value.intervalMinutes !== null
      : value.intervalMinutes === null
  );

export type BackupScheduleSettings = z.infer<typeof ScheduleSchema>;

export function validateSchedule(value: unknown): BackupScheduleSettings {
  return ScheduleSchema.parse(value);
}

const calendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Strictly after the supplied instant; an overdue schedule produces one job, not a catch-up burst. */
export function nextBackupRun(value: unknown, after: Date): Date {
  const schedule = validateSchedule(value);
  if (!Number.isFinite(after.getTime()))
    throw new Error("INVALID_SCHEDULE_DATE");
  if (schedule.frequency === "INTERVAL") {
    const result = new Date(
      after.getTime() + schedule.intervalMinutes! * 60000
    );
    if (!Number.isFinite(result.getTime()))
      throw new Error("INVALID_SCHEDULE_DATE");
    return result;
  }
  // Search UTC minutes against the timezone database, including daylight-saving transitions.
  const first = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  for (let minute = 0; minute < 9 * 24 * 60; minute++) {
    const candidate = new Date(first + minute * 60000);
    const parts = calendar.formatToParts(candidate);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(p => p.type === type)?.value;
    if (
      `${part("hour")}:${part("minute")}` === schedule.localTime &&
      (schedule.frequency === "DAILY" ||
        part("weekday") === weekdays[schedule.weekday])
    )
      return candidate;
  }
  throw new Error("INVALID_SCHEDULE_DATE");
}

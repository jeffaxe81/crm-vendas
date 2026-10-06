import { PrismaService } from "../database/prisma.service";
import { BackupScheduleService } from "./backup-schedule.service";

describe("atomic backup scheduling under tenant RLS", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let organizationId: string;
  const now = new Date("2026-10-05T05:00:00Z");
  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
  });
  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    organizationId = (
      await owner.organization.create({
        data: { name: "Schedule A", slug: "schedule-a" },
      })
    ).id;
    await runtime.withTenant(organizationId, tx =>
      tx.backupSchedule.create({
        data: { organizationId, enabled: true, nextRunAt: now },
      })
    );
  });
  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
  });
  it("enqueues once across replicas and advances the schedule in the same transaction", async () => {
    const [a, b] = await Promise.all([
      new BackupScheduleService(runtime).enqueueDue(now),
      new BackupScheduleService(runtime).enqueueDue(now),
    ]);
    expect(a + b).toBe(1);
    await runtime.withTenant(organizationId, async tx => {
      const jobs = await tx.dataOperation.findMany();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        kind: "BACKUP",
        state: "PENDING",
        actorUserId: null,
      });
      expect(jobs[0]!.payload).toMatchObject({ reason: "SCHEDULED" });
      const schedule = await tx.backupSchedule.findUniqueOrThrow({
        where: { organizationId },
      });
      expect(schedule.lastScheduledAt).toEqual(now);
      expect(schedule.nextRunAt).toEqual(new Date("2026-10-06T05:00:00Z"));
    });
    expect(await new BackupScheduleService(runtime).enqueueDue(now)).toBe(0);
  });
  it("skips disabled schedules and does not accumulate jobs for an unfinished scheduled backup", async () => {
    await runtime.withTenant(organizationId, tx =>
      tx.backupSchedule.update({
        where: { organizationId },
        data: { enabled: false },
      })
    );
    expect(await new BackupScheduleService(runtime).enqueueDue(now)).toBe(0);
    await runtime.withTenant(organizationId, async tx => {
      await tx.backupSchedule.update({
        where: { organizationId },
        data: { enabled: true },
      });
      await tx.dataOperation.create({
        data: {
          organizationId,
          kind: "BACKUP",
          payload: { reason: "SCHEDULED" },
        },
      });
    });
    expect(await new BackupScheduleService(runtime).enqueueDue(now)).toBe(0);
    expect(
      await runtime.withTenant(organizationId, tx => tx.dataOperation.count())
    ).toBe(1);
  });
  it("rolls back the job and next-run change when mandatory scheduling audit fails", async () => {
    await owner.$executeRawUnsafe(
      `CREATE FUNCTION public.test_reject_schedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='backup.scheduled' THEN RAISE EXCEPTION 'synthetic schedule audit failure'; END IF; RETURN NEW; END $$`
    );
    await owner.$executeRawUnsafe(
      "CREATE TRIGGER test_reject_schedule_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test_reject_schedule_audit()"
    );
    try {
      await expect(
        new BackupScheduleService(runtime).enqueueDue(now)
      ).rejects.toThrow();
      await runtime.withTenant(organizationId, async tx => {
        expect(await tx.dataOperation.count()).toBe(0);
        expect(
          (
            await tx.backupSchedule.findUniqueOrThrow({
              where: { organizationId },
            })
          ).nextRunAt
        ).toEqual(now);
      });
    } finally {
      await owner.$executeRawUnsafe(
        "DROP TRIGGER test_reject_schedule_audit ON public.audit_logs"
      );
      await owner.$executeRawUnsafe(
        "DROP FUNCTION public.test_reject_schedule_audit()"
      );
    }
  });
});

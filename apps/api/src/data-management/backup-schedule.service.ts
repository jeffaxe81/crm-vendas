import type { Prisma } from "../generated/prisma/client";
import type { PrismaService } from "../database/prisma.service";
import { nextBackupRun } from "./backup-schedule";

export class BackupScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueDue(now: Date = new Date()): Promise<number> {
    if (!Number.isFinite(now.getTime())) {
      throw new Error("INVALID_SCHEDULE_DATE");
    }

    const organizations = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    let enqueued = 0;

    for (const organization of organizations) {
      enqueued += await this.prisma.withTenant(organization.id, async tx => {
        const [lock] = await tx.$queryRawUnsafe<{ acquired: boolean }[]>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
          `backup-schedule:${organization.id}`
        );
        if (!lock?.acquired) return 0;

        const schedule = await tx.backupSchedule.findUnique({
          where: { organizationId: organization.id },
        });
        if (
          !schedule?.enabled ||
          schedule.nextRunAt === null ||
          schedule.nextRunAt > now
        ) {
          return 0;
        }

        const unfinished = await tx.$queryRawUnsafe<{ id: string }[]>(
          `
            SELECT id
            FROM public.data_operations
            WHERE organization_id=$1::uuid
              AND kind='BACKUP'
              AND state IN ('PENDING','RUNNING')
              AND payload->>'reason'='SCHEDULED'
            LIMIT 1
            `,
          organization.id
        );
        if (unfinished.length > 0) return 0;

        const nextRunAt = nextBackupRun(
          {
            frequency: schedule.frequency,
            localTime: schedule.localTime,
            weekday: schedule.weekday,
            intervalMinutes: schedule.intervalMinutes,
            retentionCount: schedule.retentionCount,
            timezone: schedule.timezone,
          },
          now
        );

        const operation = await tx.dataOperation.create({
          data: {
            organizationId: organization.id,
            actorUserId: null,
            kind: "BACKUP",
            state: "PENDING",
            payload: { reason: "SCHEDULED" },
          },
        });

        await tx.backupSchedule.update({
          where: { organizationId: organization.id },
          data: {
            lastScheduledAt: now,
            nextRunAt,
          },
        });

        const metadata: Prisma.InputJsonObject = {
          dataOperationId: operation.id,
          scheduledAt: now.toISOString(),
          nextRunAt: nextRunAt.toISOString(),
        };
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: null,
            requestId: operation.id,
            action: "backup.scheduled",
            entityType: "backup_schedule",
            entityId: organization.id,
            metadata,
          },
        });

        return 1;
      });
    }

    return enqueued;
  }
}

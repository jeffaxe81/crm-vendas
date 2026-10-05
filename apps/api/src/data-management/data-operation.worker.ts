import { Inject, Injectable, Optional } from "@nestjs/common";
import { BackupReasonSchema } from "@axes/contracts";
import { PrismaService } from "../database/prisma.service";
import type { DataOperation } from "../generated/prisma/client";
import { BackupService } from "./backup.service";

@Injectable()
export class DataOperationWorker {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(BackupService)
    private readonly backupService?: BackupService
  ) {}
  async claimNext(workerId: string): Promise<DataOperation | null> {
    if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(workerId))
      throw Error("INVALID_WORKER_ID");
    const organizations = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const organization of organizations) {
      const job = await this.prisma.withTenant(organization.id, async tx => {
        const [lock] = await tx.$queryRawUnsafe<{ acquired: boolean }[]>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
          `data-operation:${organization.id}`
        );
        if (!lock?.acquired) return null;
        const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
          `
          WITH candidate AS (
            SELECT id FROM public.data_operations
            WHERE organization_id=$1::uuid
              AND (state='PENDING' OR (state='RUNNING' AND lease_until <= clock_timestamp()))
              AND NOT EXISTS (
                SELECT 1 FROM public.data_operations live
                WHERE live.organization_id=$1::uuid AND live.state='RUNNING'
                  AND live.lease_until > clock_timestamp()
              )
            ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
          )
          UPDATE public.data_operations operation
          SET state='RUNNING', worker_id=$2, attempts=attempts+1,
              lease_until=clock_timestamp()+interval '60 seconds',
              heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
          FROM candidate WHERE operation.id=candidate.id RETURNING operation.id`,
          organization.id,
          workerId
        );
        if (!rows[0]) return null;
        return tx.dataOperation.findUniqueOrThrow({
          where: { id: rows[0].id },
        });
      });
      if (job) return job;
    }
    return null;
  }
  async processNext(workerId: string): Promise<boolean> {
    const job = await this.claimNext(workerId);
    if (!job) return false;
    if (job.kind !== "BACKUP" || !this.backupService) {
      throw Error("UNSUPPORTED_DATA_OPERATION");
    }

    const checkpoint =
      typeof job.checkpoint === "object" &&
      job.checkpoint !== null &&
      !Array.isArray(job.checkpoint)
        ? job.checkpoint
        : {};
    let backupId =
      checkpoint.businessCommitted === true &&
      typeof checkpoint.backupId === "string"
        ? checkpoint.backupId
        : null;

    if (backupId) {
      await this.backupService.verify(job.organizationId, backupId);
    } else {
      const payload =
        typeof job.payload === "object" &&
        job.payload !== null &&
        !Array.isArray(job.payload)
          ? job.payload
          : {};
      const reason = BackupReasonSchema.safeParse(payload.reason);
      if (!reason.success) throw Error("INVALID_BACKUP_OPERATION");

      const backup = await this.backupService.create(
        job.organizationId,
        job.actorUserId,
        reason.data,
        job.id
      );
      backupId = backup.id;

      const checkpointed = await this.prisma.withTenant(
        job.organizationId,
        tx =>
          tx.$executeRawUnsafe(
            `
            UPDATE public.data_operations
            SET checkpoint=checkpoint || jsonb_build_object(
                  'businessCommitted',true,'backupId',$5::text
                ),
                stage='BACKUP_COMMITTED',updated_at=clock_timestamp()
            WHERE id=$1::uuid AND organization_id=$2::uuid AND state='RUNNING'
              AND worker_id=$3 AND attempts=$4 AND lease_until > clock_timestamp()
            `,
            job.id,
            job.organizationId,
            job.workerId,
            job.attempts,
            backupId
          )
      );
      if (checkpointed !== 1) return false;
    }

    const schedule = await this.prisma.withTenant(job.organizationId, tx =>
      tx.backupSchedule.findUnique({
        where: { organizationId: job.organizationId },
        select: { retentionCount: true },
      })
    );
    if (
      schedule &&
      [7, 15, 30, 90].includes(schedule.retentionCount)
    ) {
      await this.backupService.pruneRetention(
        job.organizationId,
        schedule.retentionCount as 7 | 15 | 30 | 90
      );
    }

    return this.finish(job);
  }

  async heartbeat(job: DataOperation): Promise<boolean> {
    return this.prisma.withTenant(job.organizationId, async tx => {
      const count = await tx.$executeRawUnsafe(
        `
        UPDATE public.data_operations SET heartbeat_at=clock_timestamp(),
          lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
        WHERE id=$1::uuid AND organization_id=$2::uuid AND state='RUNNING'
          AND worker_id=$3 AND attempts=$4 AND lease_until > clock_timestamp()`,
        job.id,
        job.organizationId,
        job.workerId,
        job.attempts
      );
      return count === 1;
    });
  }
  async finish(job: DataOperation): Promise<boolean> {
    return this.prisma.withTenant(job.organizationId, async tx => {
      const count = await tx.$executeRawUnsafe(
        `
        UPDATE public.data_operations SET state='COMPLETED', stage='COMPLETED',
          completed_at=clock_timestamp(),updated_at=clock_timestamp(),lease_until=NULL
        WHERE id=$1::uuid AND organization_id=$2::uuid AND state='RUNNING'
          AND worker_id=$3 AND attempts=$4 AND lease_until > clock_timestamp()
          AND checkpoint->'businessCommitted'='true'::jsonb`,
        job.id,
        job.organizationId,
        job.workerId,
        job.attempts
      );
      return count === 1;
    });
  }
}

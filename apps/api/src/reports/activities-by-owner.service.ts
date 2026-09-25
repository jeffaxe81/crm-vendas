import {
  ActivitiesByOwnerQuerySchema,
  ActivitiesByOwnerReportSchema,
  type ActivitiesByOwnerCounts,
  type ActivitiesByOwnerQuery,
  type ActivitiesByOwnerReport,
  type ActivitiesByOwnerRow,
} from "@axes/contracts";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

/** Relógio do relatório; injetável para fixar "agora" nos testes. */
export type ReportClock = () => Date;

export const ACTIVITIES_BY_OWNER_CLOCK = Symbol("ACTIVITIES_BY_OWNER_CLOCK");

export const systemReportClock: ReportClock = () => new Date(Date.now());

type OwnerCountsRow = {
  owner_user_id: string;
  owner_display_name: string;
  owner_active: boolean;
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
  overdue: number;
  completed_on_time: number;
  task: number;
  appointment: number;
};

type Counts = Omit<ActivitiesByOwnerCounts, "completionRate">;

function emptyCounts(): Counts {
  return {
    total: 0,
    completed: 0,
    pending: 0,
    cancelled: 0,
    overdue: 0,
    completedOnTime: 0,
    byType: { TASK: 0, APPOINTMENT: 0 },
  };
}

function fromRow(row: OwnerCountsRow): Counts {
  return {
    total: Number(row.total),
    completed: Number(row.completed),
    pending: Number(row.pending),
    cancelled: Number(row.cancelled),
    overdue: Number(row.overdue),
    completedOnTime: Number(row.completed_on_time),
    byType: {
      TASK: Number(row.task),
      APPOINTMENT: Number(row.appointment),
    },
  };
}

function addCounts(target: Counts, source: Counts): void {
  target.total += source.total;
  target.completed += source.completed;
  target.pending += source.pending;
  target.cancelled += source.cancelled;
  target.overdue += source.overdue;
  target.completedOnTime += source.completedOnTime;
  target.byType.TASK += source.byType.TASK;
  target.byType.APPOINTMENT += source.byType.APPOINTMENT;
}

function withRate(counts: Counts): ActivitiesByOwnerCounts {
  return {
    ...counts,
    completionRate: counts.total === 0 ? null : counts.completed / counts.total,
  };
}

/** Valida a query estrita do relatório; erros viram 400 VALIDATION_ERROR. */
export function parseActivitiesByOwnerQuery(
  query: Record<string, unknown>
): ActivitiesByOwnerQuery {
  const parsed = ActivitiesByOwnerQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues.map(issue => issue.message),
    });
  }
  return parsed.data;
}

@Injectable()
export class ActivitiesByOwnerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ACTIVITIES_BY_OWNER_CLOCK) private readonly clock: ReportClock
  ) {}

  async read(
    organizationId: string,
    query: ActivitiesByOwnerQuery
  ): Promise<ActivitiesByOwnerReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const type = query.type ?? null;

    return this.prisma.withTenant(organizationId, async tenant => {
      const asOf = this.clock();

      // O filtro explícito por organização se soma ao RLS do banco.
      const conditions: Prisma.Sql[] = [
        Prisma.sql`a.organization_id = ${organizationId}::uuid`,
        Prisma.sql`a.deleted_at IS NULL`,
      ];
      // Com período informado, atividades sem prazo (due_at nulo) ficam de
      // fora: a comparação com NULL nunca é verdadeira.
      if (from) {
        conditions.push(Prisma.sql`a.due_at >= ${from}`);
      }
      if (to) {
        conditions.push(Prisma.sql`a.due_at <= ${to}`);
      }
      if (type) {
        conditions.push(Prisma.sql`a.type = ${type}::activity_type`);
      }
      const where = Prisma.join(conditions, " AND ");

      // Só responsáveis com membership na organização (ativa ou não).
      const rows = await tenant.$queryRaw<OwnerCountsRow[]>`
        SELECT
          a.owner_user_id::text AS owner_user_id,
          u.display_name AS owner_display_name,
          (m.is_active AND u.is_active) AS owner_active,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
          COUNT(*) FILTER (WHERE a.status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled,
          COUNT(*) FILTER (
            WHERE a.status = 'PENDING' AND a.due_at < ${asOf}
          )::int AS overdue,
          COUNT(*) FILTER (
            WHERE a.status = 'COMPLETED'
              AND a.completed_at IS NOT NULL
              AND a.due_at IS NOT NULL
              AND a.completed_at <= a.due_at
          )::int AS completed_on_time,
          COUNT(*) FILTER (WHERE a.type = 'TASK')::int AS task,
          COUNT(*) FILTER (WHERE a.type = 'APPOINTMENT')::int AS appointment
        FROM activities a
        JOIN organization_memberships m
          ON m.organization_id = a.organization_id
         AND m.user_id = a.owner_user_id
        JOIN users u
          ON u.id = a.owner_user_id
        WHERE ${where}
        GROUP BY a.owner_user_id, u.display_name, m.is_active, u.is_active`;

      const totals = emptyCounts();
      const items: ActivitiesByOwnerRow[] = rows
        .map(row => {
          const counts = fromRow(row);
          addCounts(totals, counts);
          return {
            ownerUserId: row.owner_user_id,
            ownerDisplayName: row.owner_display_name,
            ownerActive: row.owner_active,
            ...withRate(counts),
          };
        })
        .sort(
          (left, right) =>
            right.completed - left.completed ||
            right.total - left.total ||
            left.ownerDisplayName.localeCompare(
              right.ownerDisplayName,
              "pt-BR"
            ) ||
            left.ownerUserId.localeCompare(right.ownerUserId)
        );

      return ActivitiesByOwnerReportSchema.parse({
        asOf: asOf.toISOString(),
        filters: {
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
          type,
        },
        items,
        totals: withRate(totals),
      });
    });
  }
}

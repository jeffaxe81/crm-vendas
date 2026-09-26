import {
  SlaReportQuerySchema,
  SlaReportSchema,
  TicketPrioritySchema,
  type SlaReport,
  type SlaReportCounts,
  type SlaReportQuery,
  type TicketPriority,
} from "@axes/contracts";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { SLA_CLOCK, type SlaClock } from "../sla/sla-clock";

type SlaCountsRow = {
  priority: TicketPriority;
  opened: number;
  first_response_evaluated: number;
  first_response_on_time: number;
  resolution_evaluated: number;
  resolution_on_time: number;
  breached_open: number;
};

type Counts = Omit<SlaReportCounts, "firstResponseRate" | "resolutionRate">;

/** Da prioridade mais crítica para a menos crítica. */
const PRIORITY_ORDER: readonly TicketPriority[] = [
  ...TicketPrioritySchema.options,
].reverse();

function emptyCounts(): Counts {
  return {
    opened: 0,
    firstResponseEvaluated: 0,
    firstResponseOnTime: 0,
    resolutionEvaluated: 0,
    resolutionOnTime: 0,
    breachedOpen: 0,
  };
}

function withRates(counts: Counts): SlaReportCounts {
  return {
    ...counts,
    firstResponseRate:
      counts.firstResponseEvaluated === 0
        ? null
        : counts.firstResponseOnTime / counts.firstResponseEvaluated,
    resolutionRate:
      counts.resolutionEvaluated === 0
        ? null
        : counts.resolutionOnTime / counts.resolutionEvaluated,
  };
}

/** Valida a query estrita do relatório; erros viram 400 VALIDATION_ERROR. */
export function parseSlaReportQuery(
  query: Record<string, unknown>
): SlaReportQuery {
  const parsed = SlaReportQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues.map(issue => issue.message),
    });
  }
  return parsed.data;
}

/**
 * C5.3 — relatório de SLA por prioridade. O período filtra a abertura
 * (`opened_at`); percentuais consideram só prazos com resultado conhecido
 * (cumprido, ou vencido sem cumprimento em `asOf`); `breachedOpen` é a foto
 * de agora e independe do período.
 */
@Injectable()
export class SlaReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SLA_CLOCK) private readonly clock: SlaClock
  ) {}

  async read(
    organizationId: string,
    query: SlaReportQuery
  ): Promise<SlaReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return this.prisma.withTenant(organizationId, async tenant => {
      const asOf = this.clock();

      const periodConditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
      if (from) {
        periodConditions.push(Prisma.sql`t.opened_at >= ${from}`);
      }
      if (to) {
        periodConditions.push(Prisma.sql`t.opened_at <= ${to}`);
      }
      const inPeriod = Prisma.join(periodConditions, " AND ");

      // O filtro explícito por organização se soma ao RLS do banco.
      const rows = await tenant.$queryRaw<SlaCountsRow[]>`
        SELECT
          t.priority::text AS priority,
          COUNT(*) FILTER (WHERE ${inPeriod})::int AS opened,
          COUNT(*) FILTER (
            WHERE ${inPeriod}
              AND t.first_response_due_at IS NOT NULL
              AND (
                t.first_response_at IS NOT NULL
                OR t.first_response_due_at < ${asOf}
              )
          )::int AS first_response_evaluated,
          COUNT(*) FILTER (
            WHERE ${inPeriod}
              AND t.first_response_at IS NOT NULL
              AND t.first_response_at <= t.first_response_due_at
          )::int AS first_response_on_time,
          COUNT(*) FILTER (
            WHERE ${inPeriod}
              AND t.resolution_due_at IS NOT NULL
              AND (
                t.resolved_at IS NOT NULL
                OR (t.status <> 'CANCELLED' AND t.resolution_due_at < ${asOf})
              )
          )::int AS resolution_evaluated,
          COUNT(*) FILTER (
            WHERE ${inPeriod}
              AND t.resolved_at IS NOT NULL
              AND t.resolved_at <= t.resolution_due_at
          )::int AS resolution_on_time,
          COUNT(*) FILTER (
            WHERE t.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER')
              AND (
                (t.first_response_at IS NULL
                  AND t.first_response_due_at < ${asOf})
                OR t.resolution_due_at < ${asOf}
              )
          )::int AS breached_open
        FROM tickets t
        WHERE t.organization_id = ${organizationId}::uuid
          AND t.deleted_at IS NULL
        GROUP BY t.priority`;

      const byPriority = new Map(rows.map(row => [row.priority, row]));
      const totals = emptyCounts();
      const items = PRIORITY_ORDER.map(priority => {
        const row = byPriority.get(priority);
        const counts: Counts = row
          ? {
              opened: Number(row.opened),
              firstResponseEvaluated: Number(row.first_response_evaluated),
              firstResponseOnTime: Number(row.first_response_on_time),
              resolutionEvaluated: Number(row.resolution_evaluated),
              resolutionOnTime: Number(row.resolution_on_time),
              breachedOpen: Number(row.breached_open),
            }
          : emptyCounts();
        for (const key of Object.keys(totals) as (keyof Counts)[]) {
          totals[key] += counts[key];
        }
        return { priority, ...withRates(counts) };
      });

      return SlaReportSchema.parse({
        asOf: asOf.toISOString(),
        filters: {
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
        },
        items,
        totals: withRates(totals),
      });
    });
  }
}

import {
  SalesByMonthReportSchema,
  type SalesByMonthBucket,
  type SalesByMonthQuery,
  type SalesByMonthReport,
  type SalesByMonthRow,
} from "@axes/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { winRate } from "./sales-by-owner.service";

type StageKind = "OPEN" | "WON" | "LOST";

type MonthKindRow = {
  month: number;
  kind: StageKind;
  opportunities: number;
  value: string;
};

/** Soma exata em centavos (evita ponto flutuante). */
type ScaledBucket = { opportunities: number; value: bigint };

type ScaledBuckets = {
  open: ScaledBucket;
  won: ScaledBucket;
  lost: ScaledBucket;
  total: ScaledBucket;
};

const BUCKET_BY_KIND = {
  OPEN: "open",
  WON: "won",
  LOST: "lost",
} as const satisfies Record<StageKind, "open" | "won" | "lost">;

function toCents(value: string): bigint {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer + fraction.padEnd(2, "0").slice(0, 2));
}

function formatCents(value: bigint): string {
  const integer = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

function emptyBuckets(): ScaledBuckets {
  return {
    open: { opportunities: 0, value: 0n },
    won: { opportunities: 0, value: 0n },
    lost: { opportunities: 0, value: 0n },
    total: { opportunities: 0, value: 0n },
  };
}

function add(target: ScaledBuckets, row: MonthKindRow): void {
  const opportunities = Number(row.opportunities);
  const value = toCents(row.value);
  for (const bucket of [target[BUCKET_BY_KIND[row.kind]], target.total]) {
    bucket.opportunities += opportunities;
    bucket.value += value;
  }
}

function serialize(bucket: ScaledBucket): SalesByMonthBucket {
  return {
    opportunities: bucket.opportunities,
    value: formatCents(bucket.value),
  };
}

function serializeBuckets(buckets: ScaledBuckets) {
  return {
    open: serialize(buckets.open),
    won: serialize(buckets.won),
    lost: serialize(buckets.lost),
    total: serialize(buckets.total),
    winRate: winRate(buckets.won.opportunities, buckets.lost.opportunities),
  };
}

@Injectable()
export class SalesByMonthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    query: SalesByMonthQuery
  ): Promise<SalesByMonthReport> {
    const yearStart = new Date(Date.UTC(query.year, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(query.year + 1, 0, 1, 0, 0, 0, 0));

    return this.prisma.withTenant(
      organizationId,
      async tenant => {
        const asOf = new Date(Date.now());

        // O filtro explícito por organização se soma ao RLS do banco.
        const conditions: Prisma.Sql[] = [
          Prisma.sql`o.organization_id = ${organizationId}::uuid`,
          Prisma.sql`o.deleted_at IS NULL`,
          Prisma.sql`o.expected_close_at >= ${yearStart}`,
          Prisma.sql`o.expected_close_at < ${yearEnd}`,
        ];
        if (query.pipelineId) {
          conditions.push(
            Prisma.sql`o.pipeline_id = ${query.pipelineId}::uuid`
          );
        }
        const where = Prisma.join(conditions, " AND ");

        // Cada oportunidade conta uma vez, pelo valor estimado, no mês da
        // previsão de fechamento e na situação da etapa em que está.
        const rows = await tenant.$queryRaw<MonthKindRow[]>`
          SELECT
            EXTRACT(MONTH FROM o.expected_close_at)::int AS month,
            ps.kind::text AS kind,
            COUNT(*)::int AS opportunities,
            SUM(o.estimated_value)::text AS value
          FROM opportunities o
          JOIN pipeline_stages ps
            ON ps.id = o.stage_id
           AND ps.organization_id = o.organization_id
          WHERE ${where}
          GROUP BY EXTRACT(MONTH FROM o.expected_close_at), ps.kind`;

        const byMonth = new Map<number, ScaledBuckets>();
        for (let month = 1; month <= 12; month += 1) {
          byMonth.set(month, emptyBuckets());
        }
        const totals = emptyBuckets();

        for (const row of rows) {
          const entry = byMonth.get(row.month);
          if (entry) {
            add(entry, row);
          }
          add(totals, row);
        }

        const items: SalesByMonthRow[] = [...byMonth.entries()]
          .sort(([left], [right]) => left - right)
          .map(([month, buckets]) => ({
            month,
            ...serializeBuckets(buckets),
          }));

        return SalesByMonthReportSchema.parse({
          asOf: asOf.toISOString(),
          filters: {
            year: query.year,
            pipelineId: query.pipelineId ?? null,
          },
          items,
          totals: serializeBuckets(totals),
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }
    );
  }
}

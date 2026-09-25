import {
  SalesByOwnerReportSchema,
  type SalesByOwnerBucket,
  type SalesByOwnerQuery,
  type SalesByOwnerReport,
  type SalesByOwnerRow,
} from "@axes/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

type StageKind = "OPEN" | "WON" | "LOST";

type OwnerKindRow = {
  owner_user_id: string;
  owner_name: string;
  owner_active: boolean;
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

type ScaledRow = ScaledBuckets & {
  ownerUserId: string;
  ownerName: string;
  ownerActive: boolean;
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

function add(target: ScaledBuckets, row: OwnerKindRow): void {
  const opportunities = Number(row.opportunities);
  const value = toCents(row.value);
  for (const bucket of [target[BUCKET_BY_KIND[row.kind]], target.total]) {
    bucket.opportunities += opportunities;
    bucket.value += value;
  }
}

function serialize(bucket: ScaledBucket): SalesByOwnerBucket {
  return {
    opportunities: bucket.opportunities,
    value: formatCents(bucket.value),
  };
}

/**
 * Ganhas ÷ (ganhas + perdidas) em percentual com 1 casa, arredondado
 * meio para cima em inteiros; null quando não há oportunidades fechadas.
 */
export function winRate(won: number, lost: number): string | null {
  const closed = won + lost;
  if (closed === 0) {
    return null;
  }
  const tenths = Math.floor((won * 2000 + closed) / (closed * 2));
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
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

function compareBigIntDesc(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? -1 : 1;
}

@Injectable()
export class SalesByOwnerService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    query: SalesByOwnerQuery
  ): Promise<SalesByOwnerReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return this.prisma.withTenant(
      organizationId,
      async tenant => {
        const asOf = new Date(Date.now());

        // O filtro explícito por organização se soma ao RLS do banco.
        const conditions: Prisma.Sql[] = [
          Prisma.sql`o.organization_id = ${organizationId}::uuid`,
          Prisma.sql`o.deleted_at IS NULL`,
        ];
        if (from) {
          conditions.push(Prisma.sql`o.expected_close_at >= ${from}`);
        }
        if (to) {
          conditions.push(Prisma.sql`o.expected_close_at <= ${to}`);
        }
        if (query.pipelineId) {
          conditions.push(
            Prisma.sql`o.pipeline_id = ${query.pipelineId}::uuid`
          );
        }
        const where = Prisma.join(conditions, " AND ");

        // Cada oportunidade conta uma vez, pelo valor estimado, na situação
        // da etapa em que está; o vínculo passa pela associação ao tenant.
        const rows = await tenant.$queryRaw<OwnerKindRow[]>`
          SELECT
            o.owner_user_id::text AS owner_user_id,
            u.display_name AS owner_name,
            (m.is_active AND u.is_active) AS owner_active,
            ps.kind::text AS kind,
            COUNT(*)::int AS opportunities,
            SUM(o.estimated_value)::text AS value
          FROM opportunities o
          JOIN pipeline_stages ps
            ON ps.id = o.stage_id
           AND ps.organization_id = o.organization_id
          JOIN organization_memberships m
            ON m.organization_id = o.organization_id
           AND m.user_id = o.owner_user_id
          JOIN users u
            ON u.id = m.user_id
          WHERE ${where}
          GROUP BY o.owner_user_id, u.display_name, m.is_active, u.is_active, ps.kind`;

        const byOwner = new Map<string, ScaledRow>();
        const totals = emptyBuckets();
        for (const row of rows) {
          let entry = byOwner.get(row.owner_user_id);
          if (!entry) {
            entry = {
              ownerUserId: row.owner_user_id,
              ownerName: row.owner_name,
              ownerActive: row.owner_active,
              ...emptyBuckets(),
            };
            byOwner.set(row.owner_user_id, entry);
          }
          add(entry, row);
          add(totals, row);
        }

        const items: SalesByOwnerRow[] = [...byOwner.values()]
          .sort(
            (left, right) =>
              compareBigIntDesc(left.won.value, right.won.value) ||
              compareBigIntDesc(left.open.value, right.open.value) ||
              left.ownerName.localeCompare(right.ownerName, "pt-BR") ||
              left.ownerUserId.localeCompare(right.ownerUserId)
          )
          .map(row => ({
            ownerUserId: row.ownerUserId,
            ownerName: row.ownerName,
            ownerActive: row.ownerActive,
            ...serializeBuckets(row),
          }));

        return SalesByOwnerReportSchema.parse({
          asOf: asOf.toISOString(),
          filters: {
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
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

import {
  SalesByProductReportSchema,
  type SalesByProductBucket,
  type SalesByProductQuery,
  type SalesByProductReport,
  type SalesByProductRow,
} from "@axes/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

type StageKind = "OPEN" | "WON" | "LOST";

type ProductKindRow = {
  product_id: string;
  product_code: string;
  product_name: string;
  product_active: boolean;
  product_deleted: boolean;
  kind: StageKind;
  quantity: string;
  opportunities: number;
  value: string;
};

type KindTotalRow = {
  kind: StageKind;
  quantity: string;
  opportunities: number;
  value: string;
};

/** Soma exata em escala fixa (evita ponto flutuante). */
type ScaledBucket = { quantity: bigint; opportunities: number; value: bigint };

const BUCKET_BY_KIND = {
  OPEN: "open",
  WON: "won",
  LOST: "lost",
} as const satisfies Record<StageKind, "open" | "won" | "lost">;

function toScaled(value: string, scale: number): bigint {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer + fraction.padEnd(scale, "0").slice(0, scale));
}

function formatScaled(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const integer = value / divisor;
  const fraction = (value % divisor).toString().padStart(scale, "0");
  return `${integer}.${fraction}`;
}

function emptyBucket(): ScaledBucket {
  return { quantity: 0n, opportunities: 0, value: 0n };
}

function addBucket(target: ScaledBucket, source: ScaledBucket): void {
  target.quantity += source.quantity;
  target.opportunities += source.opportunities;
  target.value += source.value;
}

function fromRow(row: {
  quantity: string;
  opportunities: number;
  value: string;
}): ScaledBucket {
  return {
    quantity: toScaled(row.quantity, 3),
    opportunities: Number(row.opportunities),
    value: toScaled(row.value, 2),
  };
}

function serialize(bucket: ScaledBucket): SalesByProductBucket {
  return {
    quantity: formatScaled(bucket.quantity, 3),
    opportunities: bucket.opportunities,
    value: formatScaled(bucket.value, 2),
  };
}

type ScaledRow = {
  productId: string;
  productCode: string;
  productName: string;
  productActive: boolean;
  productDeleted: boolean;
  open: ScaledBucket;
  won: ScaledBucket;
  lost: ScaledBucket;
  total: ScaledBucket;
};

function compareBigIntDesc(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? -1 : 1;
}

@Injectable()
export class SalesByProductService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    query: SalesByProductQuery
  ): Promise<SalesByProductReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return this.prisma.withTenant(
      organizationId,
      async tenant => {
        const asOf = new Date(Date.now());

        // O filtro explícito por organização se soma ao RLS do banco.
        const conditions: Prisma.Sql[] = [
          Prisma.sql`oi.organization_id = ${organizationId}::uuid`,
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
        if (query.ownerUserId) {
          conditions.push(
            Prisma.sql`o.owner_user_id = ${query.ownerUserId}::uuid`
          );
        }
        const where = Prisma.join(conditions, " AND ");
        const joins = Prisma.sql`
          FROM opportunity_items oi
          JOIN opportunities o
            ON o.id = oi.opportunity_id
           AND o.organization_id = oi.organization_id
          JOIN pipeline_stages ps
            ON ps.id = o.stage_id
           AND ps.organization_id = o.organization_id`;

        const productRows = await tenant.$queryRaw<ProductKindRow[]>`
          SELECT
            p.id::text AS product_id,
            p.code AS product_code,
            p.name AS product_name,
            p.is_active AS product_active,
            (p.deleted_at IS NOT NULL) AS product_deleted,
            ps.kind::text AS kind,
            SUM(oi.quantity)::text AS quantity,
            COUNT(DISTINCT oi.opportunity_id)::int AS opportunities,
            SUM(oi.line_total)::text AS value
          ${joins}
          JOIN products p
            ON p.id = oi.product_id
           AND p.organization_id = oi.organization_id
          WHERE ${where}
          GROUP BY p.id, p.code, p.name, p.is_active, p.deleted_at, ps.kind`;

        // Totais gerais: oportunidades distintas entre todos os produtos.
        const kindRows = await tenant.$queryRaw<KindTotalRow[]>`
          SELECT
            ps.kind::text AS kind,
            SUM(oi.quantity)::text AS quantity,
            COUNT(DISTINCT oi.opportunity_id)::int AS opportunities,
            SUM(oi.line_total)::text AS value
          ${joins}
          WHERE ${where}
          GROUP BY ps.kind`;

        const byProduct = new Map<string, ScaledRow>();
        for (const row of productRows) {
          let entry = byProduct.get(row.product_id);
          if (!entry) {
            entry = {
              productId: row.product_id,
              productCode: row.product_code,
              productName: row.product_name,
              productActive: row.product_active,
              productDeleted: row.product_deleted,
              open: emptyBucket(),
              won: emptyBucket(),
              lost: emptyBucket(),
              total: emptyBucket(),
            };
            byProduct.set(row.product_id, entry);
          }
          const bucket = fromRow(row);
          addBucket(entry[BUCKET_BY_KIND[row.kind]], bucket);
          // Cada oportunidade está em uma única etapa, então a soma das
          // situações não conta a mesma oportunidade duas vezes.
          addBucket(entry.total, bucket);
        }

        const rows = [...byProduct.values()].sort(
          (left, right) =>
            compareBigIntDesc(left.won.value, right.won.value) ||
            compareBigIntDesc(left.open.value, right.open.value) ||
            left.productName.localeCompare(right.productName, "pt-BR") ||
            left.productId.localeCompare(right.productId)
        );

        const totals = {
          open: emptyBucket(),
          won: emptyBucket(),
          lost: emptyBucket(),
          total: emptyBucket(),
        };
        for (const row of kindRows) {
          const bucket = fromRow(row);
          addBucket(totals[BUCKET_BY_KIND[row.kind]], bucket);
          addBucket(totals.total, bucket);
        }

        const items: SalesByProductRow[] = rows.map(row => ({
          productId: row.productId,
          productCode: row.productCode,
          productName: row.productName,
          productActive: row.productActive,
          productDeleted: row.productDeleted,
          open: serialize(row.open),
          won: serialize(row.won),
          lost: serialize(row.lost),
          total: serialize(row.total),
        }));

        return SalesByProductReportSchema.parse({
          asOf: asOf.toISOString(),
          filters: {
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
            pipelineId: query.pipelineId ?? null,
            ownerUserId: query.ownerUserId ?? null,
          },
          items,
          totals: {
            open: serialize(totals.open),
            won: serialize(totals.won),
            lost: serialize(totals.lost),
            total: serialize(totals.total),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }
    );
  }
}

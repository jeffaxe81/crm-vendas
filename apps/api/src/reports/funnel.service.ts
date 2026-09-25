import {
  FunnelReportSchema,
  type FunnelBucket,
  type FunnelQuery,
  type FunnelReport,
} from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

type StageKind = "OPEN" | "WON" | "LOST";

type StageAggregateRow = {
  stage_id: string;
  kind: StageKind;
  stage_active: boolean;
  opportunities: number;
  value: string;
};

/** Contagem e soma exata em centavos (sem ponto flutuante). */
type ScaledBucket = { opportunities: number; cents: bigint };

/** `estimated_value` tem CHECK >= 0, então só há valores não negativos. */
function toCents(value: string): bigint {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer + fraction.padEnd(2, "0").slice(0, 2));
}

function formatScaled(value: bigint): string {
  const integer = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

/** Divisão inteira com arredondamento "meio para cima" (operandos >= 0). */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function emptyBucket(): ScaledBucket {
  return { opportunities: 0, cents: 0n };
}

function addBucket(target: ScaledBucket, source: ScaledBucket): void {
  target.opportunities += source.opportunities;
  target.cents += source.cents;
}

function serialize(bucket: ScaledBucket): FunnelBucket {
  return {
    opportunities: bucket.opportunities,
    value: formatScaled(bucket.cents),
  };
}

@Injectable()
export class FunnelService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    query: FunnelQuery
  ): Promise<FunnelReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return this.prisma.withTenant(
      organizationId,
      async tenant => {
        const asOf = new Date(Date.now());

        // Funil inativo continua consultável (histórico); outro tenant é 404.
        const pipeline = await tenant.pipeline.findFirst({
          where: { id: query.pipelineId, organizationId },
          select: { id: true, name: true, isActive: true },
        });
        if (!pipeline) {
          throw new NotFoundException({
            code: "PIPELINE_NOT_FOUND",
            message: "Funil não encontrado.",
          });
        }

        const stages = await tenant.pipelineStage.findMany({
          where: { organizationId, pipelineId: pipeline.id, isActive: true },
          select: { id: true, name: true, kind: true, position: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        });

        // O filtro explícito por organização se soma ao RLS do banco.
        const conditions: Prisma.Sql[] = [
          Prisma.sql`o.organization_id = ${organizationId}::uuid`,
          Prisma.sql`o.pipeline_id = ${pipeline.id}::uuid`,
          Prisma.sql`o.deleted_at IS NULL`,
        ];
        if (from) {
          conditions.push(Prisma.sql`o.created_at >= ${from}`);
        }
        if (to) {
          conditions.push(Prisma.sql`o.created_at <= ${to}`);
        }
        if (query.ownerUserId) {
          conditions.push(
            Prisma.sql`o.owner_user_id = ${query.ownerUserId}::uuid`
          );
        }

        const rows = await tenant.$queryRaw<StageAggregateRow[]>`
          SELECT
            o.stage_id::text AS stage_id,
            ps.kind::text AS kind,
            ps.is_active AS stage_active,
            COUNT(*)::int AS opportunities,
            COALESCE(SUM(o.estimated_value), 0)::text AS value
          FROM opportunities o
          JOIN pipeline_stages ps
            ON ps.id = o.stage_id
           AND ps.organization_id = o.organization_id
           AND ps.pipeline_id = o.pipeline_id
          WHERE ${Prisma.join(conditions, " AND ")}
          GROUP BY o.stage_id, ps.kind, ps.is_active`;

        const byStage = new Map<string, ScaledBucket>();
        const byKind: Record<StageKind, ScaledBucket> = {
          OPEN: emptyBucket(),
          WON: emptyBucket(),
          LOST: emptyBucket(),
        };
        const inactiveStages = emptyBucket();
        const totals = emptyBucket();

        for (const row of rows) {
          const bucket: ScaledBucket = {
            opportunities: Number(row.opportunities),
            cents: toCents(row.value),
          };
          if (row.stage_active) {
            byStage.set(row.stage_id, bucket);
          } else {
            addBucket(inactiveStages, bucket);
          }
          // Indicadores consideram todas as oportunidades do funil, inclusive
          // as que ficaram em etapas desativadas, pela situação da etapa.
          addBucket(byKind[row.kind], bucket);
          addBucket(totals, bucket);
        }

        const won = byKind.WON;
        const lost = byKind.LOST;
        const closed = BigInt(won.opportunities + lost.opportunities);
        const winRate =
          closed === 0n
            ? null
            : formatScaled(
                divideHalfUp(BigInt(won.opportunities) * 10000n, closed)
              );
        const averageWonTicket =
          won.opportunities === 0
            ? null
            : formatScaled(divideHalfUp(won.cents, BigInt(won.opportunities)));

        return FunnelReportSchema.parse({
          asOf: asOf.toISOString(),
          filters: {
            pipelineId: pipeline.id,
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
            ownerUserId: query.ownerUserId ?? null,
          },
          pipeline,
          stages: stages.map(stage => {
            const bucket = serialize(byStage.get(stage.id) ?? emptyBucket());
            return {
              stageId: stage.id,
              name: stage.name,
              kind: stage.kind,
              position: stage.position,
              ...bucket,
            };
          }),
          inactiveStages: serialize(inactiveStages),
          totals: serialize(totals),
          indicators: {
            openOpportunities: byKind.OPEN.opportunities,
            wonOpportunities: won.opportunities,
            lostOpportunities: lost.opportunities,
            winRate,
            openValue: formatScaled(byKind.OPEN.cents),
            wonValue: formatScaled(won.cents),
            lostValue: formatScaled(lost.cents),
            averageWonTicket,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }
    );
  }
}

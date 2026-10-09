import type { FunnelQuery } from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { evaluateCommercialRisk } from "./commercial-risk";

@Injectable()
export class CommercialRiskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(organizationId: string, query: FunnelQuery) {
    return this.prisma.withTenant(organizationId, async tenant => {
      const pipeline = await tenant.pipeline.findFirst({
        where: { id: query.pipelineId, organizationId },
        select: { id: true, name: true },
      });
      if (!pipeline) {
        throw new NotFoundException({
          code: "PIPELINE_NOT_FOUND",
          message: "Funil não encontrado.",
        });
      }
      const opportunities = await tenant.opportunity.findMany({
        where: {
          organizationId,
          pipelineId: pipeline.id,
          deletedAt: null,
          stage: { kind: "OPEN" },
          ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
          ...(query.from || query.to
            ? {
                createdAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 201,
      });
      const truncated = opportunities.length > 200;
      const sample = opportunities.slice(0, 200);
      const activities = sample.length
        ? await tenant.activity.groupBy({
            by: ["opportunityId"],
            where: {
              organizationId,
              deletedAt: null,
              opportunityId: { in: sample.map(item => item.id) },
            },
            _max: { createdAt: true },
          })
        : [];
      const lastByDeal = new Map(
        activities.map(item => [item.opportunityId, item._max.createdAt])
      );
      const asOf = new Date();
      const risks = sample
        .map(item =>
          evaluateCommercialRisk(
            {
              ...item,
              lastActivityAt: lastByDeal.get(item.id) ?? null,
            },
            asOf
          )
        )
        .filter(item => item.signals.length > 0);
      return {
        asOf: asOf.toISOString(),
        pipeline,
        evaluated: sample.length,
        truncated,
        inactivityThresholdDays: 7,
        methodology: "deterministic-commercial-risk-v1",
        caveat:
          "Atividade significa registro no CRM, não comprovação de contato efetivo com o cliente.",
        risks,
      };
    });
  }
}

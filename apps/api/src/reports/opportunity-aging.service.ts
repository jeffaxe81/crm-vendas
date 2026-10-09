import type { FunnelQuery } from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { summarizeOpportunityAges } from "./opportunity-age";

@Injectable()
export class OpportunityAgingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(organizationId: string, query: FunnelQuery) {
    return this.prisma.withTenant(organizationId, async tenant => {
      const pipeline = await tenant.pipeline.findFirst({
        where: { id: query.pipelineId, organizationId },
        select: { id: true, name: true },
      });
      if (!pipeline)
        throw new NotFoundException({
          code: "PIPELINE_NOT_FOUND",
          message: "Funil não encontrado.",
        });

      const asOf = new Date();
      const dateFilter = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
      const opportunities = await tenant.opportunity.findMany({
        where: {
          organizationId,
          pipelineId: pipeline.id,
          deletedAt: null,
          stage: { kind: "OPEN" },
          ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
          ...(query.from || query.to ? { createdAt: dateFilter } : {}),
        },
        select: { createdAt: true, stageId: true },
      });
      return {
        asOf: asOf.toISOString(),
        pipeline,
        metric: "age-since-creation",
        description:
          "Idade desde a criação, não tempo de permanência na etapa.",
        stages: summarizeOpportunityAges(opportunities, asOf),
      };
    });
  }
}

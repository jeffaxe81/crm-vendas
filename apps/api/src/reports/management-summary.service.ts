import {
  ManagementSummarySchema,
  type ManagementSummary,
} from "@axes/contracts";
import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  ActivityStatus,
  PipelineStageKind,
  Prisma,
} from "../generated/prisma/client";

@Injectable()
export class ManagementSummaryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(organizationId: string): Promise<ManagementSummary> {
    return this.prisma.withTenant(
      organizationId,
      async tenant => {
        const asOf = new Date(Date.now());

        const groupedOpportunities = await tenant.opportunity.groupBy({
          by: ["pipelineId", "stageId"],
          where: {
            organizationId,
            deletedAt: null,
          },
          _count: {
            _all: true,
          },
        });

        const stageIds = groupedOpportunities.map(item => item.stageId);
        const stages = stageIds.length
          ? await tenant.pipelineStage.findMany({
              where: {
                organizationId,
                id: { in: stageIds },
              },
              select: {
                id: true,
                pipelineId: true,
                name: true,
                position: true,
                pipeline: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            })
          : [];

        const metadataByStageId = new Map(
          stages.map(stage => [stage.id, stage] as const)
        );

        const opportunitiesByStage = groupedOpportunities.map(group => {
          const stage = metadataByStageId.get(group.stageId);
          if (
            !stage ||
            stage.pipelineId !== group.pipelineId ||
            stage.pipeline.id !== group.pipelineId
          ) {
            throw new InternalServerErrorException({
              code: "MANAGEMENT_SUMMARY_METADATA_INCONSISTENT",
              message:
                "Não foi possível resolver os metadados do funil para o resumo gerencial.",
            });
          }

          return {
            pipelineId: group.pipelineId,
            pipelineName: stage.pipeline.name,
            stageId: group.stageId,
            stageName: stage.name,
            stagePosition: stage.position,
            count: group._count._all,
          };
        });

        opportunitiesByStage.sort((left, right) =>
          left.pipelineName.localeCompare(right.pipelineName) ||
          left.pipelineId.localeCompare(right.pipelineId) ||
          left.stagePosition - right.stagePosition ||
          left.stageId.localeCompare(right.stageId)
        );

        const openValue = await tenant.opportunity.aggregate({
          where: {
            organizationId,
            deletedAt: null,
            stage: {
              kind: PipelineStageKind.OPEN,
            },
          },
          _sum: {
            estimatedValue: true,
          },
        });

        const pendingWhere = {
          organizationId,
          deletedAt: null,
          status: ActivityStatus.PENDING,
        } as const;

        const pendingActivities = await tenant.activity.count({
          where: pendingWhere,
        });
        const overdueActivities = await tenant.activity.count({
          where: {
            ...pendingWhere,
            dueAt: { lt: asOf },
          },
        });
        const undatedActivities = await tenant.activity.count({
          where: {
            ...pendingWhere,
            dueAt: null,
          },
        });

        return ManagementSummarySchema.parse({
          asOf: asOf.toISOString(),
          opportunitiesByStage: opportunitiesByStage.map(
            ({ stagePosition: _stagePosition, ...item }) => item
          ),
          openEstimatedValue:
            openValue._sum.estimatedValue?.toFixed(2) ?? "0.00",
          pendingActivities,
          overdueActivities,
          undatedActivities,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }
    );
  }
}

import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";

const DEFAULT_PIPELINE_NAME = "Funil de Vendas";
const DEFAULT_PIPELINE_NORMALIZED_NAME = "funil de vendas";

const DEFAULT_STAGES = [
  { name: "Prospecção", position: 1, kind: "OPEN" as const },
  { name: "Qualificação", position: 2, kind: "OPEN" as const },
  { name: "Proposta", position: 3, kind: "OPEN" as const },
  { name: "Negociação", position: 4, kind: "OPEN" as const },
  { name: "Ganha", position: 5, kind: "WON" as const },
  { name: "Perdida", position: 6, kind: "LOST" as const },
] as const;

export type PipelineAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

@Injectable()
export class PipelinesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, tenant =>
      tenant.pipeline.findMany({
        where: {
          organizationId,
          isActive: true,
        },
        include: {
          stages: {
            where: { isActive: true },
            orderBy: { position: "asc" },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    );
  }

  async ensureDefault(context: PipelineAdministrationContext) {
    let created = false;

    const pipeline = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await tenant.pipeline.findUnique({
          where: {
            organizationId_normalizedName: {
              organizationId: context.organizationId,
              normalizedName: DEFAULT_PIPELINE_NORMALIZED_NAME,
            },
          },
          include: {
            stages: {
              where: { isActive: true },
              orderBy: { position: "asc" },
            },
          },
        });

        if (existing) {
          return existing;
        }

        const newPipeline = await tenant.pipeline.create({
          data: {
            organizationId: context.organizationId,
            name: DEFAULT_PIPELINE_NAME,
            normalizedName: DEFAULT_PIPELINE_NORMALIZED_NAME,
            stages: {
              create: DEFAULT_STAGES.map(stage => ({
                organizationId: context.organizationId,
                name: stage.name,
                position: stage.position,
                kind: stage.kind,
              })),
            },
          },
          include: {
            stages: {
              where: { isActive: true },
              orderBy: { position: "asc" },
            },
          },
        });

        created = true;
        return newPipeline;
      }
    );

    if (created) {
      await this.audit.record({
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        action: "pipeline.default_created",
        entityType: "pipeline",
        entityId: pipeline.id,
        after: {
          name: pipeline.name,
          normalizedName: pipeline.normalizedName,
          isActive: pipeline.isActive,
          stages: pipeline.stages.map(stage => ({
            name: stage.name,
            position: stage.position,
            kind: stage.kind,
            isActive: stage.isActive,
          })),
        },
        ipAddress: context.ipAddress ?? null,
      });
    }

    return pipeline;
  }
}

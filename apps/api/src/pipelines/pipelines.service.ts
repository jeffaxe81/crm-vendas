import type {
  PipelineCreateInput,
  PipelineStageCreateInput,
  PipelineStageReorderInput,
  PipelineStageUpdateInput,
  PipelineUpdateInput,
} from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";

export type PipelineAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type AuditablePipeline = {
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

@Injectable()
export class PipelinesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(organizationId: string) {
    return this.prisma.pipeline.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async read(id: string, organizationId: string) {
    return this.requirePipeline(id, organizationId);
  }

  async create(
    input: PipelineCreateInput,
    context: PipelineAdministrationContext
  ) {
    const pipeline = await this.prisma.pipeline.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        isDefault: input.isDefault,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "pipeline.created",
      entityType: "pipeline",
      entityId: pipeline.id,
      after: this.toAuditPipeline(pipeline),
      ipAddress: context.ipAddress ?? null,
    });

    return pipeline;
  }

  async update(
    id: string,
    input: PipelineUpdateInput,
    context: PipelineAdministrationContext
  ) {
    const existing = await this.requirePipeline(id, context.organizationId);
    const updated = await this.prisma.pipeline.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isDefault !== undefined
          ? { isDefault: input.isDefault }
          : {}),
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "pipeline.updated",
      entityType: "pipeline",
      entityId: updated.id,
      before: this.toAuditPipeline(existing),
      after: this.toAuditPipeline(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async createStage(
    pipelineId: string,
    input: PipelineStageCreateInput,
    context: PipelineAdministrationContext
  ) {
    await this.requirePipeline(pipelineId, context.organizationId);

    return this.prisma.pipelineStage.create({
      data: {
        organizationId: context.organizationId,
        pipelineId,
        name: input.name,
        position: input.position,
      },
    });
  }

  async updateStage(
    pipelineId: string,
    stageId: string,
    input: PipelineStageUpdateInput,
    context: PipelineAdministrationContext
  ) {
    await this.requirePipeline(pipelineId, context.organizationId);
    const stage = await this.requireStage(
      pipelineId,
      stageId,
      context.organizationId
    );

    return this.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
    });
  }

  async reorderStages(
    pipelineId: string,
    input: PipelineStageReorderInput,
    context: PipelineAdministrationContext
  ) {
    await this.requirePipeline(pipelineId, context.organizationId);

    const uniqueStageIds = new Set(input.stageIds);
    if (uniqueStageIds.size !== input.stageIds.length) {
      throw this.stageNotFound();
    }

    const activeStages = await this.prisma.pipelineStage.findMany({
      where: {
        organizationId: context.organizationId,
        pipelineId,
        isActive: true,
      },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    if (
      activeStages.length !== input.stageIds.length ||
      activeStages.some(stage => !uniqueStageIds.has(stage.id))
    ) {
      throw this.stageNotFound();
    }

    await this.prisma.$transaction(async transaction => {
      const temporaryOffset = 100_000 + activeStages.length;

      for (const stage of activeStages) {
        await transaction.pipelineStage.update({
          where: { id: stage.id },
          data: { position: stage.position + temporaryOffset },
        });
      }

      for (const [position, stageId] of input.stageIds.entries()) {
        await transaction.pipelineStage.update({
          where: { id: stageId },
          data: { position },
        });
      }
    });

    return this.prisma.pipelineStage.findMany({
      where: {
        organizationId: context.organizationId,
        pipelineId,
        isActive: true,
      },
      orderBy: { position: "asc" },
    });
  }

  async deactivateStage(
    pipelineId: string,
    stageId: string,
    context: PipelineAdministrationContext
  ): Promise<void> {
    await this.requirePipeline(pipelineId, context.organizationId);
    const stage = await this.requireStage(
      pipelineId,
      stageId,
      context.organizationId
    );

    await this.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { isActive: false },
    });
  }

  private async requirePipeline(id: string, organizationId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: {
        id,
        organizationId,
        isActive: true,
      },
    });

    if (!pipeline) {
      throw new NotFoundException({
        code: "PIPELINE_NOT_FOUND",
        message: "Funil não encontrado.",
      });
    }

    return pipeline;
  }

  private async requireStage(
    pipelineId: string,
    stageId: string,
    organizationId: string
  ) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        id: stageId,
        pipelineId,
        organizationId,
        isActive: true,
      },
    });

    if (!stage) {
      throw this.stageNotFound();
    }

    return stage;
  }

  private stageNotFound() {
    return new NotFoundException({
      code: "PIPELINE_STAGE_NOT_FOUND",
      message: "Etapa do funil não encontrada.",
    });
  }

  private toAuditPipeline(pipeline: AuditablePipeline) {
    return {
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      isActive: pipeline.isActive,
    };
  }
}

import type { PipelineCreateInput, PipelineUpdateInput } from "@axes/contracts";
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

  private toAuditPipeline(pipeline: AuditablePipeline) {
    return {
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      isActive: pipeline.isActive,
    };
  }
}

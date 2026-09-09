import type { OpportunityCreateInput } from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";

export type OpportunityAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    input: OpportunityCreateInput,
    context: OpportunityAdministrationContext
  ) {
    await this.requireValidReferences(input, context.organizationId);

    const opportunity = await this.prisma.opportunity.create({
      data: {
        organizationId: context.organizationId,
        companyId: input.companyId,
        contactId: input.contactId,
        ownerUserId: input.ownerUserId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        title: input.title,
        estimatedValue: input.estimatedValue,
        currency: input.currency,
        expectedCloseDate: input.expectedCloseDate,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "opportunity.created",
      entityType: "opportunity",
      entityId: opportunity.id,
      after: {
        companyId: opportunity.companyId,
        contactId: opportunity.contactId,
        ownerUserId: opportunity.ownerUserId,
        pipelineId: opportunity.pipelineId,
        stageId: opportunity.stageId,
        title: opportunity.title,
        currency: opportunity.currency,
        status: opportunity.status,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return opportunity;
  }

  private async requireValidReferences(
    input: OpportunityCreateInput,
    organizationId: string
  ): Promise<void> {
    const [company, ownerMembership, pipeline, stage] = await Promise.all([
      this.prisma.company.findFirst({
        where: {
          id: input.companyId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: input.ownerUserId,
          isActive: true,
          user: { isActive: true },
        },
        select: { userId: true },
      }),
      this.prisma.pipeline.findFirst({
        where: {
          id: input.pipelineId,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      }),
      this.prisma.pipelineStage.findFirst({
        where: {
          id: input.stageId,
          organizationId,
          pipelineId: input.pipelineId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    if (!company || !ownerMembership || !pipeline || !stage) {
      throw this.referenceNotFound();
    }

    if (input.contactId) {
      const contactLink = await this.prisma.companyContact.findFirst({
        where: {
          organizationId,
          companyId: input.companyId,
          contactId: input.contactId,
          contact: {
            deletedAt: null,
          },
        },
        select: { contactId: true },
      });

      if (!contactLink) {
        throw this.referenceNotFound();
      }
    }
  }

  private referenceNotFound() {
    return new NotFoundException({
      code: "OPPORTUNITY_REFERENCE_NOT_FOUND",
      message: "Referência da oportunidade não encontrada.",
    });
  }
}

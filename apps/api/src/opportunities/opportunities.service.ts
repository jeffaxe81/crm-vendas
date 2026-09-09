import type {
  OpportunityCreateInput,
  OpportunityListQuery,
  OpportunityUpdateInput,
} from "@axes/contracts";
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

  async list(query: OpportunityListQuery, organizationId: string) {
    const where = {
      organizationId,
      ...(query.q
        ? { title: { contains: query.q, mode: "insensitive" as const } }
        : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async read(id: string, organizationId: string) {
    return this.requireOpportunity(id, organizationId);
  }

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
      after: this.toAuditOpportunity(opportunity),
      ipAddress: context.ipAddress ?? null,
    });

    return opportunity;
  }

  async update(
    id: string,
    input: OpportunityUpdateInput,
    context: OpportunityAdministrationContext
  ) {
    const existing = await this.requireOpportunity(id, context.organizationId);
    const companyId = input.companyId ?? existing.companyId;
    const contactId =
      input.contactId !== undefined ? input.contactId : existing.contactId;
    const ownerUserId = input.ownerUserId ?? existing.ownerUserId;

    await this.requireCompanyContactOwner(
      companyId,
      contactId,
      ownerUserId,
      context.organizationId
    );

    const updated = await this.prisma.opportunity.update({
      where: { id: existing.id },
      data: {
        ...(input.companyId !== undefined
          ? { companyId: input.companyId }
          : {}),
        ...(input.contactId !== undefined
          ? { contactId: input.contactId }
          : {}),
        ...(input.ownerUserId !== undefined
          ? { ownerUserId: input.ownerUserId }
          : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.estimatedValue !== undefined
          ? { estimatedValue: input.estimatedValue }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.expectedCloseDate !== undefined
          ? { expectedCloseDate: input.expectedCloseDate }
          : {}),
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "opportunity.updated",
      entityType: "opportunity",
      entityId: updated.id,
      before: this.toAuditOpportunity(existing),
      after: this.toAuditOpportunity(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  private async requireValidReferences(
    input: OpportunityCreateInput,
    organizationId: string
  ): Promise<void> {
    await this.requireCompanyContactOwner(
      input.companyId,
      input.contactId ?? null,
      input.ownerUserId,
      organizationId
    );

    const [pipeline, stage] = await Promise.all([
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

    if (!pipeline || !stage) {
      throw this.referenceNotFound();
    }
  }

  private async requireCompanyContactOwner(
    companyId: string,
    contactId: string | null,
    ownerUserId: string,
    organizationId: string
  ): Promise<void> {
    const [company, ownerMembership] = await Promise.all([
      this.prisma.company.findFirst({
        where: {
          id: companyId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: ownerUserId,
          isActive: true,
          user: { isActive: true },
        },
        select: { userId: true },
      }),
    ]);

    if (!company || !ownerMembership) {
      throw this.referenceNotFound();
    }

    if (contactId) {
      const contactLink = await this.prisma.companyContact.findFirst({
        where: {
          organizationId,
          companyId,
          contactId,
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

  private async requireOpportunity(id: string, organizationId: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!opportunity) {
      throw new NotFoundException({
        code: "OPPORTUNITY_NOT_FOUND",
        message: "Oportunidade não encontrada.",
      });
    }

    return opportunity;
  }

  private referenceNotFound() {
    return new NotFoundException({
      code: "OPPORTUNITY_REFERENCE_NOT_FOUND",
      message: "Referência da oportunidade não encontrada.",
    });
  }

  private toAuditOpportunity(opportunity: {
    companyId: string;
    contactId: string | null;
    ownerUserId: string;
    pipelineId: string;
    stageId: string;
    title: string;
    estimatedValue: { toString(): string };
    currency: string;
    expectedCloseDate: Date | null;
    status: string;
    lossReason: string | null;
  }) {
    return {
      companyId: opportunity.companyId,
      contactId: opportunity.contactId,
      ownerUserId: opportunity.ownerUserId,
      pipelineId: opportunity.pipelineId,
      stageId: opportunity.stageId,
      title: opportunity.title,
      estimatedValue: opportunity.estimatedValue.toString(),
      currency: opportunity.currency,
      expectedCloseDate: opportunity.expectedCloseDate?.toISOString() ?? null,
      status: opportunity.status,
      lossReason: opportunity.lossReason,
    };
  }
}

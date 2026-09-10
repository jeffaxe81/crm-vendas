import type {
  OpportunityCreateInput,
  OpportunityListQuery,
  OpportunityMoveInput,
  OpportunityUpdateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type OpportunityAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type OpportunityRecord = {
  id: string;
  organizationId: string;
  pipelineId: string;
  stageId: string;
  companyId: string | null;
  contactId: string | null;
  ownerUserId: string;
  title: string;
  estimatedValue: { toFixed(digits?: number): string };
  expectedCloseAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  version: number;
  deletedAt: Date | null;
  deletedBy: string | null;
};

type MutableOpportunityReferences = {
  companyId: string | null;
  contactId: string | null;
  ownerUserId: string;
};

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: OpportunityListQuery, organizationId: string) {
    const expectedCloseAt =
      query.expectedCloseFrom || query.expectedCloseTo
        ? {
            ...(query.expectedCloseFrom
              ? { gte: new Date(query.expectedCloseFrom) }
              : {}),
            ...(query.expectedCloseTo
              ? { lte: new Date(query.expectedCloseTo) }
              : {}),
          }
        : undefined;

    const where: Prisma.OpportunityWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" as const } },
              { notes: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(expectedCloseAt ? { expectedCloseAt } : {}),
    };

    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.OpportunityOrderByWithRelationInput;

    const [items, total] = await this.prisma.withTenant(
      organizationId,
      async tenant =>
        Promise.all([
          tenant.opportunity.findMany({
            where,
            orderBy,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tenant.opportunity.count({ where }),
        ])
    );

    return {
      items: items.map(item => this.toPublicOpportunity(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async read(id: string, organizationId: string) {
    const opportunity = await this.prisma.withTenant(organizationId, tenant =>
      this.requireOpportunity(tenant, id, organizationId)
    );

    return this.toPublicOpportunity(opportunity);
  }

  async create(
    input: OpportunityCreateInput,
    context: OpportunityAdministrationContext
  ) {
    const opportunity = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.validateCreateReferences(
          tenant,
          input,
          context.organizationId
        );

        return tenant.opportunity.create({
          data: {
            organizationId: context.organizationId,
            pipelineId: input.pipelineId,
            stageId: input.stageId,
            companyId: input.companyId ?? null,
            contactId: input.contactId ?? null,
            ownerUserId: input.ownerUserId,
            title: input.title,
            estimatedValue: new Prisma.Decimal(input.estimatedValue),
            expectedCloseAt: input.expectedCloseAt
              ? new Date(input.expectedCloseAt)
              : null,
            notes: input.notes ?? null,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });
      }
    );

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

    return this.toPublicOpportunity(opportunity);
  }

  async update(
    id: string,
    input: OpportunityUpdateInput,
    context: OpportunityAdministrationContext
  ) {
    const { before, after } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireOpportunity(
          tenant,
          id,
          context.organizationId
        );

        const finalCompanyId =
          input.companyId !== undefined ? input.companyId : existing.companyId;
        const finalContactId =
          input.contactId !== undefined ? input.contactId : existing.contactId;
        const finalOwnerUserId = input.ownerUserId ?? existing.ownerUserId;

        if (
          Number(Boolean(finalCompanyId)) + Number(Boolean(finalContactId)) !==
          1
        ) {
          throw new BadRequestException({
            code: "VALIDATION_ERROR",
            message: "A oportunidade deve possuir exatamente um cliente.",
          });
        }

        await this.validateMutableReferences(
          tenant,
          {
            companyId: finalCompanyId,
            contactId: finalContactId,
            ownerUserId: finalOwnerUserId,
          },
          context.organizationId
        );

        const result = await tenant.opportunity.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            deletedAt: null,
            version: input.version,
          },
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
              ? { estimatedValue: new Prisma.Decimal(input.estimatedValue) }
              : {}),
            ...(input.expectedCloseAt !== undefined
              ? {
                  expectedCloseAt: input.expectedCloseAt
                    ? new Date(input.expectedCloseAt)
                    : null,
                }
              : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          this.versionConflict();
        }

        const updated = await this.requireOpportunity(
          tenant,
          id,
          context.organizationId
        );

        return { before: existing, after: updated };
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "opportunity.updated",
      entityType: "opportunity",
      entityId: after.id,
      before: this.toAuditOpportunity(before),
      after: this.toAuditOpportunity(after),
      metadata: {
        previousVersion: before.version,
        version: after.version,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return this.toPublicOpportunity(after);
  }

  async move(
    id: string,
    input: OpportunityMoveInput,
    context: OpportunityAdministrationContext
  ) {
    const { before, after, targetStageKind } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireOpportunity(
          tenant,
          id,
          context.organizationId
        );

        const targetStage = await tenant.pipelineStage.findFirst({
          where: {
            id: input.stageId,
            organizationId: context.organizationId,
            pipelineId: existing.pipelineId,
            isActive: true,
          },
          select: { id: true, kind: true },
        });
        if (!targetStage) {
          this.referenceNotFound();
        }

        const result = await tenant.opportunity.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            stageId: targetStage.id,
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          this.versionConflict();
        }

        const updated = await this.requireOpportunity(
          tenant,
          id,
          context.organizationId
        );

        return {
          before: existing,
          after: updated,
          targetStageKind: targetStage.kind,
        };
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "opportunity.moved",
      entityType: "opportunity",
      entityId: after.id,
      before: this.toAuditOpportunity(before),
      after: this.toAuditOpportunity(after),
      metadata: {
        pipelineId: before.pipelineId,
        fromStageId: before.stageId,
        toStageId: after.stageId,
        targetStageKind,
        previousVersion: before.version,
        version: after.version,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return this.toPublicOpportunity(after);
  }

  private async requireOpportunity(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const opportunity = await tenant.opportunity.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
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

  private async validateCreateReferences(
    tenant: Prisma.TransactionClient,
    input: OpportunityCreateInput,
    organizationId: string
  ): Promise<void> {
    const [pipeline, stage, membership] = await Promise.all([
      tenant.pipeline.findFirst({
        where: { id: input.pipelineId, organizationId, isActive: true },
        select: { id: true },
      }),
      tenant.pipelineStage.findFirst({
        where: {
          id: input.stageId,
          organizationId,
          pipelineId: input.pipelineId,
          isActive: true,
        },
        select: { id: true },
      }),
      tenant.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: input.ownerUserId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    if (!pipeline || !stage || !membership) {
      this.referenceNotFound();
    }

    if (input.companyId) {
      const company = await tenant.company.findFirst({
        where: {
          id: input.companyId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!company) {
        this.referenceNotFound();
      }
    }

    if (input.contactId) {
      const contact = await tenant.contact.findFirst({
        where: {
          id: input.contactId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!contact) {
        this.referenceNotFound();
      }
    }
  }

  private async validateMutableReferences(
    tenant: Prisma.TransactionClient,
    references: MutableOpportunityReferences,
    organizationId: string
  ): Promise<void> {
    const membership = await tenant.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: references.ownerUserId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!membership) {
      this.referenceNotFound();
    }

    if (references.companyId) {
      const company = await tenant.company.findFirst({
        where: {
          id: references.companyId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!company) {
        this.referenceNotFound();
      }
    }

    if (references.contactId) {
      const contact = await tenant.contact.findFirst({
        where: {
          id: references.contactId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!contact) {
        this.referenceNotFound();
      }
    }
  }

  private referenceNotFound(): never {
    throw new NotFoundException({
      code: "OPPORTUNITY_REFERENCE_NOT_FOUND",
      message: "Referência da oportunidade não encontrada.",
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: "OPPORTUNITY_VERSION_CONFLICT",
      message: "A oportunidade foi alterada por outra operação.",
    });
  }

  private toPublicOpportunity(opportunity: OpportunityRecord) {
    return {
      ...opportunity,
      estimatedValue: opportunity.estimatedValue.toFixed(2),
    };
  }

  private toAuditOpportunity(opportunity: OpportunityRecord) {
    return {
      pipelineId: opportunity.pipelineId,
      stageId: opportunity.stageId,
      companyId: opportunity.companyId,
      contactId: opportunity.contactId,
      ownerUserId: opportunity.ownerUserId,
      title: opportunity.title,
      estimatedValue: opportunity.estimatedValue.toFixed(2),
      expectedCloseAt: opportunity.expectedCloseAt?.toISOString() ?? null,
      notes: opportunity.notes,
      version: opportunity.version,
    };
  }
}

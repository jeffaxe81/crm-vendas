import type {
  ActivityCreateInput,
  ActivityListQuery,
  ActivityUpdateInput,
} from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type ActivityAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type AuditableActivity = {
  type: string;
  status: string;
  priority: string;
  title: string;
  description: string | null;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  ownerUserId: string;
  dueAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: ActivityListQuery, organizationId: string) {
    const dueAt =
      query.dueFrom || query.dueTo
        ? {
            ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
            ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
          }
        : undefined;

    const where: Prisma.ActivityWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              {
                title: { contains: query.q, mode: "insensitive" as const },
              },
              {
                description: {
                  contains: query.q,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
      ...(dueAt ? { dueAt } : {}),
    };

    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.ActivityOrderByWithRelationInput;

    const [items, total] = await this.prisma.withTenant(
      organizationId,
      async tenant =>
        Promise.all([
          tenant.activity.findMany({
            where,
            orderBy,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tenant.activity.count({ where }),
        ])
    );

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async read(id: string, organizationId: string) {
    return this.prisma.withTenant(organizationId, tenant =>
      this.requireActivity(tenant, id, organizationId)
    );
  }

  async create(
    input: ActivityCreateInput,
    context: ActivityAdministrationContext
  ) {
    const activity = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.validateReferences(tenant, input, context.organizationId);

        return tenant.activity.create({
          data: {
            organizationId: context.organizationId,
            type: input.type,
            priority: input.priority,
            title: input.title,
            description: input.description,
            companyId: input.companyId,
            contactId: input.contactId,
            opportunityId: input.opportunityId,
            ownerUserId: input.ownerUserId,
            dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
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
      action: "activity.created",
      entityType: "activity",
      entityId: activity.id,
      after: this.toAuditActivity(activity),
      ipAddress: context.ipAddress ?? null,
    });

    return activity;
  }

  async update(
    id: string,
    input: ActivityUpdateInput,
    context: ActivityAdministrationContext
  ) {
    const [existing, updated] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireActivity(
          tenant,
          id,
          context.organizationId
        );
        await this.validateReferences(tenant, input, context.organizationId);

        const statusData = this.statusData(input.status);
        const updated = await tenant.activity.update({
          where: { id: existing.id },
          data: {
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.priority !== undefined
              ? { priority: input.priority }
              : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.companyId !== undefined
              ? { companyId: input.companyId }
              : {}),
            ...(input.contactId !== undefined
              ? { contactId: input.contactId }
              : {}),
            ...(input.ownerUserId !== undefined
              ? { ownerUserId: input.ownerUserId }
              : {}),
            ...(input.dueAt !== undefined
              ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
              : {}),
            ...statusData,
            updatedBy: context.actorUserId,
          },
        });

        return [existing, updated] as const;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: this.auditActionForUpdate(existing.status, input.status),
      entityType: "activity",
      entityId: updated.id,
      before: this.toAuditActivity(existing),
      after: this.toAuditActivity(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async remove(
    id: string,
    context: ActivityAdministrationContext
  ): Promise<void> {
    const [existing, updated, deletedAt] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireActivity(
          tenant,
          id,
          context.organizationId
        );
        const deletedAt = new Date();
        const updated = await tenant.activity.update({
          where: { id: existing.id },
          data: {
            deletedAt,
            deletedBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });

        return [existing, updated, deletedAt] as const;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "activity.deleted",
      entityType: "activity",
      entityId: updated.id,
      before: this.toAuditActivity(existing),
      after: {
        ...this.toAuditActivity(updated),
        deletedAt: deletedAt.toISOString(),
        deletedBy: context.actorUserId,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private async requireActivity(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const activity = await tenant.activity.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });

    if (!activity) {
      throw new NotFoundException({
        code: "ACTIVITY_NOT_FOUND",
        message: "Atividade não encontrada.",
      });
    }

    return activity;
  }

  private async validateReferences(
    tenant: Prisma.TransactionClient,
    input: {
      ownerUserId?: string;
      companyId?: string | null;
      contactId?: string | null;
      opportunityId?: string | null;
    },
    organizationId: string
  ): Promise<void> {
    if (input.ownerUserId !== undefined) {
      const membership = await tenant.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: input.ownerUserId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!membership) {
        this.referenceNotFound();
      }
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

    if (input.opportunityId) {
      const opportunity = await tenant.opportunity.findFirst({
        where: {
          id: input.opportunityId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!opportunity) {
        this.referenceNotFound();
      }
    }
  }

  private referenceNotFound(): never {
    throw new NotFoundException({
      code: "ACTIVITY_REFERENCE_NOT_FOUND",
      message: "Referência da atividade não encontrada.",
    });
  }

  private statusData(status: ActivityUpdateInput["status"]) {
    if (status === undefined) {
      return {};
    }

    if (status === "COMPLETED") {
      return {
        status,
        completedAt: new Date(),
        cancelledAt: null,
      } as const;
    }

    if (status === "CANCELLED") {
      return {
        status,
        completedAt: null,
        cancelledAt: new Date(),
      } as const;
    }

    return {
      status,
      completedAt: null,
      cancelledAt: null,
    } as const;
  }

  private auditActionForUpdate(
    previousStatus: string,
    requestedStatus: ActivityUpdateInput["status"]
  ) {
    if (requestedStatus === "COMPLETED" && previousStatus !== "COMPLETED") {
      return "activity.completed";
    }
    if (requestedStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
      return "activity.cancelled";
    }
    return "activity.updated";
  }

  private toAuditActivity(activity: AuditableActivity) {
    return {
      type: activity.type,
      status: activity.status,
      priority: activity.priority,
      title: activity.title,
      description: activity.description,
      companyId: activity.companyId,
      contactId: activity.contactId,
      opportunityId: activity.opportunityId,
      ownerUserId: activity.ownerUserId,
      dueAt: activity.dueAt?.toISOString() ?? null,
      completedAt: activity.completedAt?.toISOString() ?? null,
      cancelledAt: activity.cancelledAt?.toISOString() ?? null,
    };
  }
}

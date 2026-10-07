import type {
  TerritoryCoverageTargetInput,
  TerritoryCreateInput,
  TerritoryQuotaInput,
  TerritoryQuotaPeriod,
  TerritoryUpdateInput,
} from "@axes/contracts";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { roleHasPermission } from "../authorization/permissions";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type TerritoryAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

export type TerritoryListQuery = {
  page: number;
  limit: number;
  q?: string;
  region?: string;
  sortBy: "name" | "region" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
};

type AuditableTerritory = {
  name: string;
  region: string;
  description: string | null;
  salesRepId: string | null;
  version: number;
};

@Injectable()
export class TerritoriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: TerritoryListQuery, organizationId: string) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(query.q
        ? { name: { contains: query.q, mode: "insensitive" as const } }
        : {}),
      ...(query.region ? { region: query.region } : {}),
    };

    const orderBy = { [query.sortBy]: query.sortOrder } as const;

    const [items, total] = await this.prisma.withTenant(
      organizationId,
      async tenant =>
        Promise.all([
          tenant.territory.findMany({
            where,
            orderBy,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            include: {
              salesRep: {
                select: { id: true, displayName: true },
              },
            },
          }),
          tenant.territory.count({ where }),
        ])
    );

    return { items, page: query.page, limit: query.limit, total };
  }

  async read(id: string, organizationId: string) {
    return this.prisma.withTenant(organizationId, tenant =>
      this.requireTerritory(tenant, id, organizationId)
    );
  }

  async listAssignableSalesReps(organizationId: string) {
    return this.prisma.withTenant(organizationId, async tenant => {
      const memberships = await tenant.organizationMembership.findMany({
        where: {
          organizationId,
          isActive: true,
          user: { isActive: true },
        },
        include: {
          user: {
            select: { id: true, displayName: true },
          },
        },
        orderBy: [{ user: { displayName: "asc" } }, { createdAt: "asc" }],
      });

      return memberships
        .filter(membership => roleHasPermission(membership.role, "territory.write"))
        .map(membership => ({
          id: membership.user.id,
          displayName: membership.user.displayName,
          role: membership.role,
        }));
    });
  }

  async create(
    input: TerritoryCreateInput,
    context: TerritoryAdministrationContext
  ) {
    const territory = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        if (input.salesRepId) {
          await this.requireAssignableSalesRep(
            tenant,
            input.salesRepId,
            context.organizationId
          );
        }

        return tenant.territory.create({
          data: {
            organizationId: context.organizationId,
            name: input.name,
            region: input.region,
            description: input.description,
            salesRepId: input.salesRepId,
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
      action: "territory.created",
      entityType: "territory",
      entityId: territory.id,
      after: this.toAuditTerritory(territory),
      ipAddress: context.ipAddress ?? null,
    });

    return territory;
  }

  async update(
    id: string,
    input: TerritoryUpdateInput,
    context: TerritoryAdministrationContext
  ) {
    const [existing, updated] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTerritory(
          tenant,
          id,
          context.organizationId
        );
        if (input.salesRepId !== undefined) {
          await this.requireAssignableSalesRep(
            tenant,
            input.salesRepId,
            context.organizationId
          );
        }

        const updated = await tenant.territory.update({
          where: { id: existing.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.region !== undefined ? { region: input.region } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.salesRepId !== undefined
              ? { salesRepId: input.salesRepId }
              : {}),
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        return [existing, updated] as const;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "territory.updated",
      entityType: "territory",
      entityId: updated.id,
      before: this.toAuditTerritory(existing),
      after: this.toAuditTerritory(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async remove(
    id: string,
    context: TerritoryAdministrationContext
  ): Promise<void> {
    const [existing, updated, deletedAt] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTerritory(
          tenant,
          id,
          context.organizationId
        );
        const deletedAt = new Date();
        const updated = await tenant.territory.update({
          where: { id: existing.id },
          data: {
            deletedAt,
            deletedBy: context.actorUserId,
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        return [existing, updated, deletedAt] as const;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "territory.deleted",
      entityType: "territory",
      entityId: updated.id,
      before: this.toAuditTerritory(existing),
      after: {
        ...this.toAuditTerritory(updated),
        deletedAt: deletedAt.toISOString(),
        deletedBy: context.actorUserId,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  async reassign(
    id: string,
    salesRepId: string,
    context: TerritoryAdministrationContext
  ) {
    const [existing, updated] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTerritory(
          tenant,
          id,
          context.organizationId
        );

        await this.requireAssignableSalesRep(
          tenant,
          salesRepId,
          context.organizationId
        );

        if (existing.salesRepId === salesRepId) {
          throw new ConflictException({
            code: "TERRITORY_ALREADY_ASSIGNED",
            message: "Território já está atribuído a este vendedor.",
          });
        }

        const updated = await tenant.territory.update({
          where: { id: existing.id },
          data: {
            salesRepId,
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        return [existing, updated] as const;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "territory.reassigned",
      entityType: "territory",
      entityId: updated.id,
      before: { salesRepId: existing.salesRepId },
      after: { salesRepId: updated.salesRepId },
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  // --- Coverage ---------------------------------------------------------

  async listCoverage(
    territoryId: string,
    organizationId: string,
    status?: string
  ) {
    return this.prisma.withTenant(organizationId, async tenant => {
      await this.requireTerritory(tenant, territoryId, organizationId);
      return tenant.territoryTarget.findMany({
        where: {
          organizationId,
          territoryId,
          ...(status ? { coverageStatus: status as never } : {}),
        },
        include: { company: { select: { id: true, legalName: true } } },
        orderBy: { createdAt: "asc" },
      });
    });
  }

  async addCoverageTarget(
    territoryId: string,
    input: TerritoryCoverageTargetInput,
    context: TerritoryAdministrationContext
  ) {
    const target = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireTerritory(
          tenant,
          territoryId,
          context.organizationId
        );

        const existing = await tenant.territoryTarget.findFirst({
          where: {
            territoryId,
            companyId: input.companyId,
            organizationId: context.organizationId,
          },
        });
        if (existing) {
          throw new ConflictException({
            code: "TERRITORY_TARGET_ALREADY_EXISTS",
            message: "Esta empresa já é um alvo deste território.",
          });
        }

        return tenant.territoryTarget.create({
          data: {
            organizationId: context.organizationId,
            territoryId,
            companyId: input.companyId,
            coverageStatus: input.coverageStatus ?? "UNCOVERED",
          },
        });
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "territory.coverage.added",
      entityType: "territory_target",
      entityId: target.id,
      after: {
        territoryId,
        companyId: target.companyId,
        coverageStatus: target.coverageStatus,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return target;
  }

  async updateCoverageTarget(
    territoryId: string,
    companyId: string,
    coverageStatus: string,
    context: TerritoryAdministrationContext
  ) {
    const target = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireTerritory(
          tenant,
          territoryId,
          context.organizationId
        );
        const existing = await this.requireCoverageTarget(
          tenant,
          territoryId,
          companyId,
          context.organizationId
        );
        return tenant.territoryTarget.update({
          where: { id: existing.id },
          data: { coverageStatus: coverageStatus as never },
        });
      }
    );

    return target;
  }

  async removeCoverageTarget(
    territoryId: string,
    companyId: string,
    context: TerritoryAdministrationContext
  ): Promise<void> {
    const target = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireTerritory(
          tenant,
          territoryId,
          context.organizationId
        );
        const existing = await this.requireCoverageTarget(
          tenant,
          territoryId,
          companyId,
          context.organizationId
        );
        await tenant.territoryTarget.delete({ where: { id: existing.id } });
        return existing;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "territory.coverage.removed",
      entityType: "territory_target",
      entityId: target.id,
      before: { territoryId, companyId: target.companyId },
      ipAddress: context.ipAddress ?? null,
    });
  }

  // --- Quotas -------------------------------------------------------------

  async listQuotas(
    territoryId: string,
    organizationId: string,
    query: { period?: TerritoryQuotaPeriod; year?: number }
  ) {
    return this.prisma.withTenant(organizationId, async tenant => {
      await this.requireTerritory(tenant, territoryId, organizationId);
      return tenant.territoryQuota.findMany({
        where: {
          organizationId,
          territoryId,
          ...(query.period ? { period: query.period } : {}),
          ...(query.year !== undefined ? { year: query.year } : {}),
        },
        orderBy: [{ year: "desc" }, { period: "asc" }],
      });
    });
  }

  async setQuota(
    territoryId: string,
    input: TerritoryQuotaInput,
    context: TerritoryAdministrationContext
  ) {
    const quota = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireTerritory(
          tenant,
          territoryId,
          context.organizationId
        );

        return tenant.territoryQuota.upsert({
          where: {
            territoryId_period_year: {
              territoryId,
              period: input.period,
              year: input.year,
            },
          },
          create: {
            organizationId: context.organizationId,
            territoryId,
            period: input.period,
            year: input.year,
            amount: input.amount,
            actual: input.actual ?? 0,
          },
          update: {
            amount: input.amount,
            ...(input.actual !== undefined ? { actual: input.actual } : {}),
          },
        });
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "territory.quota.set",
      entityType: "territory_quota",
      entityId: quota.id,
      after: {
        territoryId,
        period: quota.period,
        year: quota.year,
        amount: quota.amount.toString(),
      },
      ipAddress: context.ipAddress ?? null,
    });

    return quota;
  }

  // --- Metrics --------------------------------------------------------

  async getMetrics(territoryId: string, organizationId: string) {
    return this.prisma.withTenant(organizationId, async tenant => {
      await this.requireTerritory(tenant, territoryId, organizationId);

      const [targets, quotas] = await Promise.all([
        tenant.territoryTarget.findMany({ where: { territoryId } }),
        tenant.territoryQuota.findMany({ where: { territoryId } }),
      ]);

      const targetCount = targets.length;
      const coveredCount = targets.filter(
        target => target.coverageStatus === "COVERED"
      ).length;
      const coveragePercentage =
        targetCount === 0
          ? 0
          : Math.round((coveredCount / targetCount) * 10_000) / 100;

      const totalQuota = quotas.reduce(
        (sum, quota) => sum + Number(quota.amount),
        0
      );
      const totalActual = quotas.reduce(
        (sum, quota) => sum + Number(quota.actual),
        0
      );
      const quotaPercentage =
        totalQuota === 0
          ? 0
          : Math.round((totalActual / totalQuota) * 10_000) / 100;

      const metrics = await tenant.territoryMetrics.upsert({
        where: { territoryId },
        create: {
          organizationId,
          territoryId,
          coveragePercentage,
          quotaPercentage,
          actualRevenue: totalActual,
          targetCount,
          coveredCount,
        },
        update: {
          coveragePercentage,
          quotaPercentage,
          actualRevenue: totalActual,
          targetCount,
          coveredCount,
          lastUpdatedAt: new Date(),
        },
      });

      return metrics;
    });
  }

  // --- Helpers ----------------------------------------------------------

  private async requireAssignableSalesRep(
    tenant: Prisma.TransactionClient,
    salesRepId: string,
    organizationId: string
  ) {
    const membership = await tenant.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: salesRepId,
        isActive: true,
        user: { isActive: true },
      },
      include: { user: { select: { id: true, displayName: true } } },
    });

    if (
      !membership ||
      !roleHasPermission(membership.role, "territory.write")
    ) {
      throw new NotFoundException({
        code: "TERRITORY_SALES_REP_NOT_FOUND",
        message:
          "Vendedor não encontrado ou não disponível nesta organização.",
      });
    }

    return membership;
  }

  private async requireTerritory(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const territory = await tenant.territory.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!territory) {
      throw new NotFoundException({
        code: "TERRITORY_NOT_FOUND",
        message: "Território não encontrado.",
      });
    }

    return territory;
  }

  private async requireCoverageTarget(
    tenant: Prisma.TransactionClient,
    territoryId: string,
    companyId: string,
    organizationId: string
  ) {
    const target = await tenant.territoryTarget.findFirst({
      where: { territoryId, companyId, organizationId },
    });

    if (!target) {
      throw new NotFoundException({
        code: "TERRITORY_TARGET_NOT_FOUND",
        message: "Alvo de cobertura não encontrado para este território.",
      });
    }

    return target;
  }

  private toAuditTerritory(territory: AuditableTerritory) {
    return {
      name: territory.name,
      region: territory.region,
      description: territory.description,
      salesRepId: territory.salesRepId,
      version: territory.version,
    };
  }
}

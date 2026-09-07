import type { CompanyCreateInput, CompanyUpdateInput } from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";

export type CompanyAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

export type CompanyListQuery = {
  page: number;
  limit: number;
  q?: string;
  sortBy: "legalName" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
};

type AuditableCompany = {
  legalName: string;
  tradeName: string | null;
  document: string | null;
  website: string | null;
  notes: string | null;
  version: number;
};

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: CompanyListQuery, organizationId: string) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              {
                legalName: { contains: query.q, mode: "insensitive" as const },
              },
              {
                tradeName: { contains: query.q, mode: "insensitive" as const },
              },
              { document: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as const;

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async read(id: string, organizationId: string) {
    return this.requireCompany(id, organizationId);
  }

  async create(
    input: CompanyCreateInput,
    context: CompanyAdministrationContext
  ) {
    const company = await this.prisma.company.create({
      data: {
        organizationId: context.organizationId,
        legalName: input.legalName,
        tradeName: input.tradeName,
        document: input.document,
        website: input.website,
        notes: input.notes,
        createdBy: context.actorUserId,
        updatedBy: context.actorUserId,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      after: this.toAuditCompany(company),
      ipAddress: context.ipAddress ?? null,
    });

    return company;
  }

  async update(
    id: string,
    input: CompanyUpdateInput,
    context: CompanyAdministrationContext
  ) {
    const existing = await this.requireCompany(id, context.organizationId);
    const updated = await this.prisma.company.update({
      where: { id: existing.id },
      data: {
        ...(input.legalName !== undefined
          ? { legalName: input.legalName }
          : {}),
        ...(input.tradeName !== undefined
          ? { tradeName: input.tradeName }
          : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedBy: context.actorUserId,
        version: { increment: 1 },
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "company.updated",
      entityType: "company",
      entityId: updated.id,
      before: this.toAuditCompany(existing),
      after: this.toAuditCompany(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async remove(
    id: string,
    context: CompanyAdministrationContext
  ): Promise<void> {
    const existing = await this.requireCompany(id, context.organizationId);
    const deletedAt = new Date();
    const updated = await this.prisma.company.update({
      where: { id: existing.id },
      data: {
        deletedAt,
        deletedBy: context.actorUserId,
        updatedBy: context.actorUserId,
        version: { increment: 1 },
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "company.deleted",
      entityType: "company",
      entityId: updated.id,
      before: this.toAuditCompany(existing),
      after: {
        ...this.toAuditCompany(updated),
        deletedAt: deletedAt.toISOString(),
        deletedBy: context.actorUserId,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private async requireCompany(id: string, organizationId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });

    if (!company) {
      throw new NotFoundException({
        code: "COMPANY_NOT_FOUND",
        message: "Empresa não encontrada.",
      });
    }

    return company;
  }

  private toAuditCompany(company: AuditableCompany) {
    return {
      legalName: company.legalName,
      tradeName: company.tradeName,
      document: company.document,
      website: company.website,
      notes: company.notes,
      version: company.version,
    };
  }
}

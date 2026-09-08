import type { TagInput } from "@axes/contracts";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";

export type TagAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

export type TagListQuery = {
  page: number;
  limit: number;
  q?: string;
};

@Injectable()
export class TagsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: TagListQuery, organizationId: string) {
    const where = {
      organizationId,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              {
                normalizedName: {
                  contains: this.normalize(query.q),
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tag.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async create(input: TagInput, context: TagAdministrationContext) {
    const normalizedName = this.normalize(input.name);
    const existing = await this.prisma.tag.findFirst({
      where: {
        organizationId: context.organizationId,
        normalizedName,
      },
    });

    if (existing) {
      throw new ConflictException({
        code: "TAG_ALREADY_EXISTS",
        message: "Já existe uma tag com este nome nesta organização.",
      });
    }

    const tag = await this.prisma.tag.create({
      data: {
        organizationId: context.organizationId,
        name: input.name.trim(),
        normalizedName,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "tag.created",
      entityType: "tag",
      entityId: tag.id,
      after: {
        name: tag.name,
        normalizedName: tag.normalizedName,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return tag;
  }

  async update(id: string, input: TagInput, context: TagAdministrationContext) {
    const existing = await this.requireTag(id, context.organizationId);
    const normalizedName = this.normalize(input.name);
    const duplicate = await this.prisma.tag.findFirst({
      where: {
        organizationId: context.organizationId,
        normalizedName,
        id: { not: id },
      },
    });

    if (duplicate) {
      throw new ConflictException({
        code: "TAG_ALREADY_EXISTS",
        message: "Já existe uma tag com este nome nesta organização.",
      });
    }

    const updated = await this.prisma.tag.update({
      where: { id: existing.id },
      data: {
        name: input.name.trim(),
        normalizedName,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "tag.updated",
      entityType: "tag",
      entityId: updated.id,
      before: {
        name: existing.name,
        normalizedName: existing.normalizedName,
      },
      after: {
        name: updated.name,
        normalizedName: updated.normalizedName,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async linkCompany(
    companyId: string,
    tagId: string,
    context: TagAdministrationContext
  ) {
    await Promise.all([
      this.requireCompany(companyId, context.organizationId),
      this.requireTag(tagId, context.organizationId),
    ]);

    const existing = await this.prisma.companyTag.findFirst({
      where: {
        organizationId: context.organizationId,
        companyId,
        tagId,
      },
    });

    if (existing) {
      return existing;
    }

    const link = await this.prisma.companyTag.create({
      data: {
        organizationId: context.organizationId,
        companyId,
        tagId,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "tag.linked",
      entityType: "company_tag",
      entityId: link.id,
      metadata: {
        targetType: "company",
        companyId,
        tagId,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return link;
  }

  async unlinkCompany(
    companyId: string,
    tagId: string,
    context: TagAdministrationContext
  ): Promise<void> {
    await Promise.all([
      this.requireCompany(companyId, context.organizationId),
      this.requireTag(tagId, context.organizationId),
    ]);

    const link = await this.prisma.companyTag.findFirst({
      where: {
        organizationId: context.organizationId,
        companyId,
        tagId,
      },
    });

    if (!link) {
      throw new NotFoundException({
        code: "TAG_LINK_NOT_FOUND",
        message: "Vínculo de tag não encontrado.",
      });
    }

    await this.prisma.companyTag.delete({ where: { id: link.id } });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "tag.unlinked",
      entityType: "company_tag",
      entityId: link.id,
      metadata: {
        targetType: "company",
        companyId,
        tagId,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  async linkContact(
    contactId: string,
    tagId: string,
    context: TagAdministrationContext
  ) {
    await Promise.all([
      this.requireContact(contactId, context.organizationId),
      this.requireTag(tagId, context.organizationId),
    ]);

    const existing = await this.prisma.contactTag.findFirst({
      where: {
        organizationId: context.organizationId,
        contactId,
        tagId,
      },
    });

    if (existing) {
      return existing;
    }

    const link = await this.prisma.contactTag.create({
      data: {
        organizationId: context.organizationId,
        contactId,
        tagId,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "tag.linked",
      entityType: "contact_tag",
      entityId: link.id,
      metadata: {
        targetType: "contact",
        contactId,
        tagId,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return link;
  }

  async unlinkContact(
    contactId: string,
    tagId: string,
    context: TagAdministrationContext
  ): Promise<void> {
    await Promise.all([
      this.requireContact(contactId, context.organizationId),
      this.requireTag(tagId, context.organizationId),
    ]);

    const link = await this.prisma.contactTag.findFirst({
      where: {
        organizationId: context.organizationId,
        contactId,
        tagId,
      },
    });

    if (!link) {
      throw new NotFoundException({
        code: "TAG_LINK_NOT_FOUND",
        message: "Vínculo de tag não encontrado.",
      });
    }

    await this.prisma.contactTag.delete({ where: { id: link.id } });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "tag.unlinked",
      entityType: "contact_tag",
      entityId: link.id,
      metadata: {
        targetType: "contact",
        contactId,
        tagId,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private normalize(name: string): string {
    return name.trim().toLowerCase();
  }

  private async requireTag(id: string, organizationId: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, organizationId },
    });

    if (!tag) {
      throw new NotFoundException({
        code: "TAG_NOT_FOUND",
        message: "Tag não encontrada.",
      });
    }

    return tag;
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

  private async requireContact(id: string, organizationId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });

    if (!contact) {
      throw new NotFoundException({
        code: "CONTACT_NOT_FOUND",
        message: "Contato não encontrado.",
      });
    }

    return contact;
  }
}

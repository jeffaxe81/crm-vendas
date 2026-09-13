import type { RelationshipEntryCreateInput } from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";

export type RelationshipContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

export type RelationshipListQuery = {
  page: number;
  limit: number;
  companyId?: string;
  contactId?: string;
};

export type CompanyContactInput = {
  relationshipLabel?: string;
  isPrimary: boolean;
};

@Injectable()
export class RelationshipsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async linkCompanyContact(
    companyId: string,
    contactId: string,
    input: CompanyContactInput,
    context: RelationshipContext
  ) {
    const link = await this.prisma.withTenant(
      context.organizationId,
      async transaction => {
        const company = await transaction.company.findFirst({
          where: {
            id: companyId,
            organizationId: context.organizationId,
            deletedAt: null,
          },
        });
        if (!company) {
          throw this.companyNotFound();
        }

        const contact = await transaction.contact.findFirst({
          where: {
            id: contactId,
            organizationId: context.organizationId,
            deletedAt: null,
          },
        });
        if (!contact) {
          throw this.contactNotFound();
        }

        return transaction.companyContact.create({
          data: {
            organizationId: context.organizationId,
            companyId,
            contactId,
            relationshipLabel: input.relationshipLabel,
            isPrimary: input.isPrimary,
          },
        });
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "company.contact_linked",
      entityType: "company_contact",
      entityId: link.id,
      after: {
        companyId: link.companyId,
        contactId: link.contactId,
        relationshipLabel: link.relationshipLabel,
        isPrimary: link.isPrimary,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return link;
  }

  async unlinkCompanyContact(
    companyId: string,
    contactId: string,
    context: RelationshipContext
  ): Promise<void> {
    const existing = await this.prisma.companyContact.findFirst({
      where: {
        organizationId: context.organizationId,
        companyId,
        contactId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: "COMPANY_CONTACT_NOT_FOUND",
        message: "Vínculo entre empresa e contato não encontrado.",
      });
    }

    // SECURITY: Delete uses composite key with organizationId to prevent cross-tenant deletion
    await this.prisma.withTenant(
      context.organizationId,
      async transaction => {
        await transaction.companyContact.delete({
          where: {
            organizationId_companyId_contactId: {
              organizationId: context.organizationId,
              companyId,
              contactId,
            },
          },
        });
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "company.contact_unlinked",
      entityType: "company_contact",
      entityId: existing.id,
      before: {
        companyId: existing.companyId,
        contactId: existing.contactId,
        relationshipLabel: existing.relationshipLabel,
        isPrimary: existing.isPrimary,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  async createEntry(
    input: RelationshipEntryCreateInput,
    context: RelationshipContext
  ) {
    const entry = await this.prisma.withTenant(
      context.organizationId,
      async transaction => {
        if (input.companyId) {
          const company = await transaction.company.findFirst({
            where: {
              id: input.companyId,
              organizationId: context.organizationId,
              deletedAt: null,
            },
          });
          if (!company) {
            throw this.companyNotFound();
          }
        }

        if (input.contactId) {
          const contact = await transaction.contact.findFirst({
            where: {
              id: input.contactId,
              organizationId: context.organizationId,
              deletedAt: null,
            },
          });
          if (!contact) {
            throw this.contactNotFound();
          }
        }

        return transaction.relationshipEntry.create({
          data: {
            organizationId: context.organizationId,
            companyId: input.companyId,
            contactId: input.contactId,
            authorUserId: context.actorUserId,
            kind: input.kind,
            content: input.content,
            occurredAt: new Date(input.occurredAt),
          },
        });
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "relationship.created",
      entityType: "relationship_entry",
      entityId: entry.id,
      after: {
        companyId: entry.companyId,
        contactId: entry.contactId,
        kind: entry.kind,
        content: entry.content,
        occurredAt: entry.occurredAt.toISOString(),
      },
      ipAddress: context.ipAddress ?? null,
    });

    return entry;
  }

  async listEntries(query: RelationshipListQuery, organizationId: string) {
    const where = {
      organizationId,
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.relationshipEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.relationshipEntry.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  private companyNotFound(): NotFoundException {
    return new NotFoundException({
      code: "COMPANY_NOT_FOUND",
      message: "Empresa não encontrada.",
    });
  }

  private contactNotFound(): NotFoundException {
    return new NotFoundException({
      code: "CONTACT_NOT_FOUND",
      message: "Contato não encontrado.",
    });
  }
}

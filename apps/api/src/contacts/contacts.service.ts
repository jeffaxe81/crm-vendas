import type {
  ContactChannelInput,
  ContactCreateInput,
  ContactUpdateInput,
} from "@axes/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type ContactAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

export type ContactListQuery = {
  page: number;
  limit: number;
  q?: string;
  sortBy: "fullName" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
};

type AuditableContact = {
  fullName: string;
  jobTitle: string | null;
  notes: string | null;
  version: number;
};

type AuditableChannel = {
  type: string;
  value: string;
  label: string | null;
  isPrimary: boolean;
};

@Injectable()
export class ContactsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: ContactListQuery, organizationId: string) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              {
                fullName: { contains: query.q, mode: "insensitive" as const },
              },
              {
                jobTitle: { contains: query.q, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    };

    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as const;

    const [items, total] = await this.prisma.withTenant(
      organizationId,
      async tenant =>
        Promise.all([
          tenant.contact.findMany({
            where,
            include: {
              channels: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              },
              relationshipEntries: {
                orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
              },
            },
            orderBy,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tenant.contact.count({ where }),
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
      this.requireContact(tenant, id, organizationId)
    );
  }

  async create(
    input: ContactCreateInput,
    context: ContactAdministrationContext
  ) {
    const contact = await this.prisma.withTenant(
      context.organizationId,
      tenant =>
        tenant.contact.create({
          data: {
            organizationId: context.organizationId,
            fullName: input.fullName,
            jobTitle: input.jobTitle,
            notes: input.notes,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        })
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "contact.created",
      entityType: "contact",
      entityId: contact.id,
      after: this.toAuditContact(contact),
      ipAddress: context.ipAddress ?? null,
    });

    return contact;
  }

  /**
   * Cria o contato e seus canais numa única transação do tenant (usado pela
   * importação C4.2.2), preservando a mesma auditoria dos fluxos unitários.
   */
  async createWithChannels(
    input: ContactCreateInput,
    channels: ContactChannelInput[],
    context: ContactAdministrationContext,
    companyLink?: { companyId: string }
  ) {
    const { contact, createdChannels, link } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const created = await tenant.contact.create({
          data: {
            organizationId: context.organizationId,
            fullName: input.fullName,
            jobTitle: input.jobTitle,
            notes: input.notes,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });

        const channelRows = [];
        for (const channel of channels) {
          channelRows.push(
            await tenant.contactChannel.create({
              data: {
                organizationId: context.organizationId,
                contactId: created.id,
                type: channel.type,
                value: channel.value,
                label: channel.label,
                isPrimary: channel.isPrimary,
              },
            })
          );
        }

        // Vínculo opcional com empresa (C4.2.3). A FK composta
        // (company_id, organization_id) impede vincular empresa de outro tenant.
        const createdLink = companyLink
          ? await tenant.companyContact.create({
              data: {
                organizationId: context.organizationId,
                companyId: companyLink.companyId,
                contactId: created.id,
                isPrimary: false,
              },
            })
          : undefined;

        return {
          contact: created,
          createdChannels: channelRows,
          link: createdLink,
        };
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "contact.created",
      entityType: "contact",
      entityId: contact.id,
      after: this.toAuditContact(contact),
      ipAddress: context.ipAddress ?? null,
    });

    for (const channel of createdChannels) {
      await this.audit.record({
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        action: "contact.channel_created",
        entityType: "contact_channel",
        entityId: channel.id,
        after: this.toAuditChannel(channel),
        metadata: { contactId: contact.id },
        ipAddress: context.ipAddress ?? null,
      });
    }

    if (link) {
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
    }

    return { contact, channels: createdChannels, link };
  }

  /**
   * Retorna, em minúsculas, os e-mails informados que já pertencem a
   * contatos ativos do tenant.
   */
  async existingEmails(
    emails: string[],
    organizationId: string
  ): Promise<Set<string>> {
    const normalized = Array.from(
      new Set(emails.map(email => email.trim().toLocaleLowerCase("pt-BR")))
    ).filter(email => email.length > 0);

    if (normalized.length === 0) {
      return new Set();
    }

    const channels = await this.prisma.withTenant(organizationId, tenant =>
      tenant.contactChannel.findMany({
        where: {
          organizationId,
          type: "EMAIL",
          contact: { deletedAt: null },
          OR: normalized.map(email => ({
            // `contains` tolera espaços salvos ao redor do valor legado;
            // a comparação exata é feita abaixo, após normalização.
            value: { contains: email, mode: "insensitive" as const },
          })),
        },
        select: { value: true },
      })
    );

    const requested = new Set(normalized);
    return new Set(
      channels
        .map(channel => channel.value.trim().toLocaleLowerCase("pt-BR"))
        .filter(email => requested.has(email))
    );
  }

  async update(
    id: string,
    input: ContactUpdateInput,
    context: ContactAdministrationContext
  ) {
    const [existing, updated] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireContact(
          tenant,
          id,
          context.organizationId
        );
        const updated = await tenant.contact.update({
          where: { id: existing.id },
          data: {
            ...(input.fullName !== undefined
              ? { fullName: input.fullName }
              : {}),
            ...(input.jobTitle !== undefined
              ? { jobTitle: input.jobTitle }
              : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
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
      action: "contact.updated",
      entityType: "contact",
      entityId: updated.id,
      before: this.toAuditContact(existing),
      after: this.toAuditContact(updated),
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async remove(
    id: string,
    context: ContactAdministrationContext
  ): Promise<void> {
    const [existing, updated, deletedAt] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireContact(
          tenant,
          id,
          context.organizationId
        );
        const deletedAt = new Date();
        const updated = await tenant.contact.update({
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
      action: "contact.deleted",
      entityType: "contact",
      entityId: updated.id,
      before: this.toAuditContact(existing),
      after: {
        ...this.toAuditContact(updated),
        deletedAt: deletedAt.toISOString(),
        deletedBy: context.actorUserId,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  async createChannel(
    contactId: string,
    input: ContactChannelInput,
    context: ContactAdministrationContext
  ) {
    const channel = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireContact(tenant, contactId, context.organizationId);

        if (input.isPrimary) {
          await tenant.contactChannel.updateMany({
            where: {
              organizationId: context.organizationId,
              contactId,
              type: input.type,
              isPrimary: true,
            },
            data: { isPrimary: false },
          });
        }

        return tenant.contactChannel.create({
          data: {
            organizationId: context.organizationId,
            contactId,
            type: input.type,
            value: input.value,
            label: input.label,
            isPrimary: input.isPrimary,
          },
        });
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "contact.channel_created",
      entityType: "contact_channel",
      entityId: channel.id,
      after: this.toAuditChannel(channel),
      metadata: { contactId },
      ipAddress: context.ipAddress ?? null,
    });

    return channel;
  }

  async updateChannel(
    contactId: string,
    channelId: string,
    input: ContactChannelInput,
    context: ContactAdministrationContext
  ) {
    const [existing, updated] = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireContact(tenant, contactId, context.organizationId);
        const existing = await this.requireChannel(
          tenant,
          contactId,
          channelId,
          context.organizationId
        );

        if (input.isPrimary) {
          await tenant.contactChannel.updateMany({
            where: {
              organizationId: context.organizationId,
              contactId,
              type: input.type,
              isPrimary: true,
              id: { not: channelId },
            },
            data: { isPrimary: false },
          });
        }

        const updated = await tenant.contactChannel.update({
          where: { id: existing.id },
          data: {
            type: input.type,
            value: input.value,
            label: input.label,
            isPrimary: input.isPrimary,
          },
        });

        return [existing, updated] as const;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "contact.channel_updated",
      entityType: "contact_channel",
      entityId: updated.id,
      before: this.toAuditChannel(existing),
      after: this.toAuditChannel(updated),
      metadata: { contactId },
      ipAddress: context.ipAddress ?? null,
    });

    return updated;
  }

  async removeChannel(
    contactId: string,
    channelId: string,
    context: ContactAdministrationContext
  ): Promise<void> {
    const existing = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.requireContact(tenant, contactId, context.organizationId);
        const existing = await this.requireChannel(
          tenant,
          contactId,
          channelId,
          context.organizationId
        );

        await tenant.contactChannel.delete({
          where: { id: existing.id },
        });

        return existing;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "contact.channel_deleted",
      entityType: "contact_channel",
      entityId: existing.id,
      before: this.toAuditChannel(existing),
      metadata: { contactId },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private async requireContact(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const contact = await tenant.contact.findFirst({
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

  private async requireChannel(
    tenant: Prisma.TransactionClient,
    contactId: string,
    channelId: string,
    organizationId: string
  ) {
    const channel = await tenant.contactChannel.findFirst({
      where: {
        id: channelId,
        contactId,
        organizationId,
      },
    });

    if (!channel) {
      throw new NotFoundException({
        code: "CONTACT_CHANNEL_NOT_FOUND",
        message: "Canal de contato não encontrado.",
      });
    }

    return channel;
  }

  private toAuditContact(contact: AuditableContact) {
    return {
      fullName: contact.fullName,
      jobTitle: contact.jobTitle,
      notes: contact.notes,
      version: contact.version,
    };
  }

  private toAuditChannel(channel: AuditableChannel) {
    return {
      type: channel.type,
      value: channel.value,
      label: channel.label,
      isPrimary: channel.isPrimary,
    };
  }
}

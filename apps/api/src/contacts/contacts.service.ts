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
            ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
            ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
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
    await this.prisma.withTenant(context.organizationId, tenant =>
      this.requireContact(tenant, contactId, context.organizationId)
    );

    const channel = await this.prisma.$transaction(async transaction => {
      if (input.isPrimary) {
        await transaction.contactChannel.updateMany({
          where: {
            organizationId: context.organizationId,
            contactId,
            type: input.type,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }

      return transaction.contactChannel.create({
        data: {
          organizationId: context.organizationId,
          contactId,
          type: input.type,
          value: input.value,
          label: input.label,
          isPrimary: input.isPrimary,
        },
      });
    });

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
    await this.prisma.withTenant(context.organizationId, tenant =>
      this.requireContact(tenant, contactId, context.organizationId)
    );
    const existing = await this.requireChannel(
      contactId,
      channelId,
      context.organizationId
    );

    const updated = await this.prisma.$transaction(async transaction => {
      if (input.isPrimary) {
        await transaction.contactChannel.updateMany({
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

      return transaction.contactChannel.update({
        where: { id: existing.id },
        data: {
          type: input.type,
          value: input.value,
          label: input.label,
          isPrimary: input.isPrimary,
        },
      });
    });

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
    await this.prisma.withTenant(context.organizationId, tenant =>
      this.requireContact(tenant, contactId, context.organizationId)
    );
    const existing = await this.requireChannel(
      contactId,
      channelId,
      context.organizationId
    );

    await this.prisma.contactChannel.delete({
      where: { id: existing.id },
    });

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
    contactId: string,
    channelId: string,
    organizationId: string
  ) {
    const channel = await this.prisma.contactChannel.findFirst({
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

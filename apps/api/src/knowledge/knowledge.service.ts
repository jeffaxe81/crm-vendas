import type {
  KnowledgeCreateInput,
  KnowledgeListQuery,
  KnowledgeUpdateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  KNOWLEDGE_STORAGE,
  type KnowledgeStorage,
} from "./knowledge-storage";

type KnowledgeContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type KnowledgeRelations = {
  companyIds?: string[];
  contactIds?: string[];
  opportunityIds?: string[];
};

const relationInclude = {
  companyLinks: { select: { companyId: true } },
  contactLinks: { select: { contactId: true } },
  opportunityLinks: { select: { opportunityId: true } },
} as const;

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(KNOWLEDGE_STORAGE) private readonly storage: KnowledgeStorage
  ) {}

  private visibleWhere(
    context: KnowledgeContext
  ): Prisma.KnowledgeItemWhereInput {
    return {
      organizationId: context.organizationId,
      deletedAt: null,
      OR: [
        { accessLevel: "ORGANIZATION" },
        { createdBy: context.actorUserId },
      ],
    };
  }

  private itemNotFound(): never {
    throw new NotFoundException({
      code: "KNOWLEDGE_NOT_FOUND",
      message: "Registro não encontrado.",
    });
  }

  private async requireItem(
    tenant: Prisma.TransactionClient,
    id: string,
    context: KnowledgeContext
  ) {
    const item = await tenant.knowledgeItem.findFirst({
      where: { ...this.visibleWhere(context), id },
      include: relationInclude,
    });
    if (!item) this.itemNotFound();
    return item;
  }

  private toResponse<
    T extends {
      storageKey: string | null;
      sizeBytes: bigint | null;
      companyLinks: Array<{ companyId: string }>;
      contactLinks: Array<{ contactId: string }>;
      opportunityLinks: Array<{ opportunityId: string }>;
    },
  >(row: T) {
    const {
      storageKey: _storageKey,
      sizeBytes,
      companyLinks,
      contactLinks,
      opportunityLinks,
      ...metadata
    } = row;
    return {
      ...metadata,
      sizeBytes: sizeBytes === null ? null : Number(sizeBytes),
      companyIds: companyLinks.map(link => link.companyId),
      contactIds: contactLinks.map(link => link.contactId),
      opportunityIds: opportunityLinks.map(link => link.opportunityId),
    };
  }

  async list(query: KnowledgeListQuery, context: KnowledgeContext) {
    const where: Prisma.KnowledgeItemWhereInput = {
      ...this.visibleWhere(context),
      ...(query.type ? { type: query.type } : {}),
      ...(query.accessLevel ? { accessLevel: query.accessLevel } : {}),
      ...(query.createdBy ? { createdBy: query.createdBy } : {}),
      ...(query.q
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: query.q, mode: "insensitive" } },
                  { category: { contains: query.q, mode: "insensitive" } },
                  { source: { contains: query.q, mode: "insensitive" } },
                ],
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.withTenant(
      context.organizationId,
      tenant =>
        Promise.all([
          tenant.knowledgeItem.findMany({
            where,
            include: relationInclude,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          }),
          tenant.knowledgeItem.count({ where }),
        ])
    );
    return {
      items: items.map(row => this.toResponse(row)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async read(id: string, context: KnowledgeContext) {
    return this.prisma.withTenant(context.organizationId, async tenant => {
      const item = await this.requireItem(tenant, id, context);
      return this.toResponse(item);
    });
  }

  private async validateRelations(
    tenant: Prisma.TransactionClient,
    links: KnowledgeRelations,
    organizationId: string
  ): Promise<void> {
    if (links.companyIds?.length) {
      const count = await tenant.company.count({
        where: {
          id: { in: links.companyIds },
          organizationId,
          deletedAt: null,
        },
      });
      if (count !== links.companyIds.length) this.itemNotFound();
    }
    if (links.contactIds?.length) {
      const count = await tenant.contact.count({
        where: {
          id: { in: links.contactIds },
          organizationId,
          deletedAt: null,
        },
      });
      if (count !== links.contactIds.length) this.itemNotFound();
    }
    if (links.opportunityIds?.length) {
      const count = await tenant.opportunity.count({
        where: {
          id: { in: links.opportunityIds },
          organizationId,
          deletedAt: null,
        },
      });
      if (count !== links.opportunityIds.length) this.itemNotFound();
    }
  }

  private async replaceRelations(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    links: KnowledgeRelations
  ): Promise<void> {
    if (links.companyIds !== undefined) {
      await tenant.knowledgeCompany.deleteMany({
        where: { organizationId, knowledgeItemId: id },
      });
      if (links.companyIds.length) {
        await tenant.knowledgeCompany.createMany({
          data: links.companyIds.map(companyId => ({
            organizationId,
            knowledgeItemId: id,
            companyId,
          })),
        });
      }
    }
    if (links.contactIds !== undefined) {
      await tenant.knowledgeContact.deleteMany({
        where: { organizationId, knowledgeItemId: id },
      });
      if (links.contactIds.length) {
        await tenant.knowledgeContact.createMany({
          data: links.contactIds.map(contactId => ({
            organizationId,
            knowledgeItemId: id,
            contactId,
          })),
        });
      }
    }
    if (links.opportunityIds !== undefined) {
      await tenant.knowledgeOpportunity.deleteMany({
        where: { organizationId, knowledgeItemId: id },
      });
      if (links.opportunityIds.length) {
        await tenant.knowledgeOpportunity.createMany({
          data: links.opportunityIds.map(opportunityId => ({
            organizationId,
            knowledgeItemId: id,
            opportunityId,
          })),
        });
      }
    }
  }

  async create(input: KnowledgeCreateInput, context: KnowledgeContext) {
    const id = randomUUID();
    const stored =
      input.type === "DOCUMENT"
        ? await this.storage.put(id, input.document)
        : null;

    try {
      await this.prisma.withTenant(context.organizationId, async tenant => {
        await this.validateRelations(tenant, input, context.organizationId);
        const item = await tenant.knowledgeItem.create({
          data: {
            id,
            organizationId: context.organizationId,
            type: input.type,
            title: input.title,
            category: input.category ?? null,
            source: input.source ?? null,
            accessLevel: input.accessLevel,
            noteContent: input.type === "NOTE" ? input.noteContent : null,
            url: input.type === "LINK" ? input.url : null,
            originalFileName:
              input.type === "DOCUMENT" ? input.document.fileName : null,
            mimeType:
              input.type === "DOCUMENT" ? input.document.mimeType : null,
            storageKey: stored?.storageKey ?? null,
            sizeBytes: stored ? BigInt(stored.sizeBytes) : null,
            sha256: stored?.sha256 ?? null,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });
        await this.replaceRelations(
          tenant,
          id,
          context.organizationId,
          input
        );
        await tenant.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            action: "knowledge.created",
            entityType: "knowledge",
            entityId: item.id,
            metadata: {
              type: item.type,
              accessLevel: item.accessLevel,
            },
            ipAddress: context.ipAddress ?? null,
          },
        });
      });
    } catch (error) {
      if (stored) await this.storage.remove(stored.storageKey).catch(() => {});
      throw error;
    }

    return this.read(id, context);
  }

  async update(
    id: string,
    input: KnowledgeUpdateInput,
    context: KnowledgeContext
  ) {
    const original = await this.prisma.withTenant(
      context.organizationId,
      tenant => this.requireItem(tenant, id, context)
    );
    if (
      (input.noteContent !== undefined && original.type !== "NOTE") ||
      (input.url !== undefined && original.type !== "LINK") ||
      (input.document !== undefined && original.type !== "DOCUMENT") ||
      (original.type === "NOTE" && input.noteContent === null) ||
      (original.type === "LINK" && input.url === null)
    ) {
      throw new BadRequestException({
        code: "KNOWLEDGE_TYPE_MISMATCH",
        message: "Alteração incompatível com o tipo do registro.",
      });
    }

    const stored = input.document
      ? await this.storage.put(id, input.document)
      : null;
    try {
      await this.prisma.withTenant(context.organizationId, async tenant => {
        await this.requireItem(tenant, id, context);
        await this.validateRelations(tenant, input, context.organizationId);
        const result = await tenant.knowledgeItem.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: original.version,
            deletedAt: null,
          },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.category !== undefined
              ? { category: input.category }
              : {}),
            ...(input.source !== undefined ? { source: input.source } : {}),
            ...(input.accessLevel !== undefined
              ? { accessLevel: input.accessLevel }
              : {}),
            ...(input.noteContent !== undefined
              ? { noteContent: input.noteContent }
              : {}),
            ...(input.url !== undefined ? { url: input.url } : {}),
            ...(stored && input.document
              ? {
                  originalFileName: input.document.fileName,
                  mimeType: input.document.mimeType,
                  storageKey: stored.storageKey,
                  sha256: stored.sha256,
                  sizeBytes: BigInt(stored.sizeBytes),
                }
              : {}),
            version: { increment: 1 },
            updatedBy: context.actorUserId,
          },
        });
        if (result.count !== 1) {
          throw new ConflictException({
            code: "KNOWLEDGE_VERSION_CONFLICT",
            message: "O registro foi alterado por outra operação.",
          });
        }
        await this.replaceRelations(
          tenant,
          id,
          context.organizationId,
          input
        );
        await tenant.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorUserId: context.actorUserId,
            requestId: context.requestId,
            action: "knowledge.updated",
            entityType: "knowledge",
            entityId: id,
            metadata: {
              version: original.version + 1,
              documentReplaced: Boolean(stored),
            },
            ipAddress: context.ipAddress ?? null,
          },
        });
      });
    } catch (error) {
      if (stored) await this.storage.remove(stored.storageKey).catch(() => {});
      throw error;
    }
    // Keep the replaced blob until a separate retention/backup policy is
    // implemented; deleting it here could break a concurrent snapshot.
    return this.read(id, context);
  }

  async remove(id: string, context: KnowledgeContext): Promise<void> {
    await this.prisma.withTenant(context.organizationId, async tenant => {
      const item = await this.requireItem(tenant, id, context);
      const result = await tenant.knowledgeItem.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          deletedAt: null,
          version: item.version,
        },
        data: {
          deletedAt: new Date(),
          deletedBy: context.actorUserId,
          updatedBy: context.actorUserId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: "KNOWLEDGE_VERSION_CONFLICT",
          message: "O registro foi alterado por outra operação.",
        });
      }
      await tenant.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "knowledge.deleted",
          entityType: "knowledge",
          entityId: id,
          metadata: { type: item.type },
          ipAddress: context.ipAddress ?? null,
        },
      });
    });
  }

  async download(id: string, context: KnowledgeContext) {
    const item = await this.prisma.withTenant(
      context.organizationId,
      tenant => this.requireItem(tenant, id, context)
    );
    if (
      item.type !== "DOCUMENT" ||
      !item.storageKey ||
      !item.originalFileName ||
      !item.mimeType ||
      !item.sha256
    ) {
      this.itemNotFound();
    }
    const bytes = await this.storage.get(item.storageKey).catch(() => {
      throw new InternalServerErrorException("DOCUMENT_STORAGE_UNAVAILABLE");
    });
    if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) {
      throw new InternalServerErrorException("DOCUMENT_INTEGRITY_FAILED");
    }
    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "knowledge.document_downloaded",
      entityType: "knowledge",
      entityId: id,
      metadata: { sizeBytes: bytes.length },
      ipAddress: context.ipAddress ?? null,
    });
    return {
      bytes,
      fileName: item.originalFileName,
      mimeType: item.mimeType,
    };
  }
}

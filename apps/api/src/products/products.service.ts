import type {
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
} from "@axes/contracts";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type ProductAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type ProductRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: { toFixed(digits?: number): string };
  isActive: boolean;
  version: number;
};

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: ProductListQuery, organizationId: string) {
    const where: Prisma.ProductWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" as const } },
              { name: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.withTenant(
      organizationId,
      tenant =>
        Promise.all([
          tenant.product.findMany({
            where,
            orderBy: { [query.sortBy]: query.sortOrder },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tenant.product.count({ where }),
        ])
    );

    return {
      items: items.map(item => this.toPublic(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async read(id: string, organizationId: string) {
    const product = await this.prisma.withTenant(organizationId, tenant =>
      this.requireProduct(tenant, id, organizationId)
    );
    return this.toPublic(product);
  }

  async create(
    input: ProductCreateInput,
    context: ProductAdministrationContext
  ) {
    const product = await this.withUniqueCode(() =>
      this.prisma.withTenant(context.organizationId, async tenant => {
        await this.assertCodeAvailable(
          tenant,
          input.code,
          context.organizationId
        );
        return tenant.product.create({
          data: {
            organizationId: context.organizationId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            unitPrice: new Prisma.Decimal(input.unitPrice),
            isActive: input.isActive,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });
      })
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      after: this.toAudit(product),
      ipAddress: context.ipAddress ?? null,
    });

    return this.toPublic(product);
  }

  /**
   * Códigos (em minúsculas) já usados por produtos não excluídos do tenant,
   * dentre os informados. Usado pela importação CSV (C4.3.2).
   */
  async existingCodes(
    codes: string[],
    organizationId: string
  ): Promise<Set<string>> {
    const normalized = Array.from(
      new Set(codes.map(code => code.trim().toLocaleLowerCase("pt-BR")))
    ).filter(code => code.length > 0);

    if (normalized.length === 0) {
      return new Set();
    }

    const products = await this.prisma.withTenant(organizationId, tenant =>
      tenant.product.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: normalized.map(code => ({
            code: { equals: code, mode: "insensitive" as const },
          })),
        },
        select: { code: true },
      })
    );

    return new Set(
      products.map(product => product.code.toLocaleLowerCase("pt-BR"))
    );
  }

  async update(
    id: string,
    input: ProductUpdateInput,
    context: ProductAdministrationContext
  ) {
    const { before, after } = await this.withUniqueCode(() =>
      this.prisma.withTenant(context.organizationId, async tenant => {
        const existing = await this.requireProduct(
          tenant,
          id,
          context.organizationId
        );

        if (
          input.code !== undefined &&
          input.code.toLocaleLowerCase("pt-BR") !==
            existing.code.toLocaleLowerCase("pt-BR")
        ) {
          await this.assertCodeAvailable(
            tenant,
            input.code,
            context.organizationId,
            id
          );
        }

        const result = await tenant.product.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.unitPrice !== undefined
              ? { unitPrice: new Prisma.Decimal(input.unitPrice) }
              : {}),
            ...(input.isActive !== undefined
              ? { isActive: input.isActive }
              : {}),
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          this.versionConflict();
        }

        const updated = await this.requireProduct(
          tenant,
          id,
          context.organizationId
        );
        return { before: existing, after: updated };
      })
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "product.updated",
      entityType: "product",
      entityId: after.id,
      before: this.toAudit(before),
      after: this.toAudit(after),
      metadata: { previousVersion: before.version, version: after.version },
      ipAddress: context.ipAddress ?? null,
    });

    return this.toPublic(after);
  }

  async remove(id: string, context: ProductAdministrationContext) {
    const { before, after } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireProduct(
          tenant,
          id,
          context.organizationId
        );
        const deleted = await tenant.product.update({
          where: { id: existing.id },
          data: {
            deletedAt: new Date(),
            deletedBy: context.actorUserId,
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        return { before: existing, after: deleted };
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "product.deleted",
      entityType: "product",
      entityId: after.id,
      before: this.toAudit(before),
      after: {
        ...this.toAudit(after),
        deletedAt: after.deletedAt?.toISOString() ?? null,
        deletedBy: after.deletedBy,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private async requireProduct(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const product = await tenant.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Produto não encontrado.",
      });
    }
    return product;
  }

  private async assertCodeAvailable(
    tenant: Prisma.TransactionClient,
    code: string,
    organizationId: string,
    exceptId?: string
  ) {
    const clash = await tenant.product.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        code: { equals: code, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      this.codeConflict();
    }
  }

  /** Converte violação do índice único (corrida entre requisições) em 409. */
  private async withUniqueCode<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        this.codeConflict();
      }
      throw error;
    }
  }

  private codeConflict(): never {
    throw new ConflictException({
      code: "PRODUCT_CODE_CONFLICT",
      message: "Já existe um produto com este código.",
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: "PRODUCT_VERSION_CONFLICT",
      message: "O produto foi alterado por outra operação.",
    });
  }

  private toPublic<T extends ProductRecord>(product: T) {
    return { ...product, unitPrice: product.unitPrice.toFixed(2) };
  }

  private toAudit(product: ProductRecord) {
    return {
      code: product.code,
      name: product.name,
      description: product.description,
      unitPrice: product.unitPrice.toFixed(2),
      isActive: product.isActive,
      version: product.version,
    };
  }
}

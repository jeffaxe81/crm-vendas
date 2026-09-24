import {
  MAX_MONEY_CENTS,
  calculateLineTotalCents,
  formatCents,
  type OpportunityItemCreateInput,
  type OpportunityItemUpdateInput,
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
import type { OpportunityAdministrationContext } from "./opportunities.service";

type Decimalish = { toFixed(digits?: number): string };

type ItemRecord = {
  id: string;
  opportunityId: string;
  productId: string;
  description: string;
  quantity: Decimalish;
  unitPrice: Decimalish;
  discountPercent: Decimalish;
  lineTotal: Decimalish;
};

type OpportunityRecord = {
  id: string;
  estimatedValue: Decimalish;
  version: number;
};

/**
 * C4.3.1 — itens da oportunidade. Toda mutação recalcula
 * `estimatedValue = Σ lineTotal` e incrementa `version` da oportunidade na
 * mesma transação, usando o `version` informado como trava otimista.
 */
@Injectable()
export class OpportunityItemsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(opportunityId: string, organizationId: string) {
    const items = await this.prisma.withTenant(organizationId, async tenant => {
      await this.requireOpportunity(tenant, opportunityId, organizationId);
      return tenant.opportunityItem.findMany({
        where: { organizationId, opportunityId },
        orderBy: { createdAt: "asc" },
      });
    });
    return { items: items.map(item => this.toPublicItem(item)) };
  }

  async add(
    opportunityId: string,
    input: OpportunityItemCreateInput,
    context: OpportunityAdministrationContext
  ) {
    const outcome = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const before = await this.requireOpportunity(
          tenant,
          opportunityId,
          context.organizationId
        );
        const product = await tenant.product.findFirst({
          where: {
            id: input.productId,
            organizationId: context.organizationId,
            deletedAt: null,
            isActive: true,
          },
        });
        if (!product) {
          throw new NotFoundException({
            code: "PRODUCT_NOT_FOUND",
            message: "Produto não encontrado ou inativo.",
          });
        }

        const unitPrice = input.unitPrice ?? product.unitPrice.toFixed(2);
        const lineTotal = this.lineTotal({
          quantity: input.quantity,
          unitPrice,
          discountPercent: input.discountPercent,
        });

        const item = await tenant.opportunityItem.create({
          data: {
            organizationId: context.organizationId,
            opportunityId,
            productId: product.id,
            description: product.name,
            quantity: new Prisma.Decimal(input.quantity),
            unitPrice: new Prisma.Decimal(unitPrice),
            discountPercent: new Prisma.Decimal(input.discountPercent),
            lineTotal: new Prisma.Decimal(lineTotal),
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });

        const after = await this.recalculate(
          tenant,
          opportunityId,
          input.version,
          context
        );
        return { before, after, item };
      }
    );

    await this.recordAudit("opportunity.item_added", outcome, context, {
      after: this.toAuditItem(outcome.item),
    });

    return {
      item: this.toPublicItem(outcome.item),
      opportunity: this.toPublicOpportunity(outcome.after),
    };
  }

  async update(
    opportunityId: string,
    itemId: string,
    input: OpportunityItemUpdateInput,
    context: OpportunityAdministrationContext
  ) {
    const outcome = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const before = await this.requireOpportunity(
          tenant,
          opportunityId,
          context.organizationId
        );
        const existing = await this.requireItem(
          tenant,
          opportunityId,
          itemId,
          context.organizationId
        );

        const quantity = input.quantity ?? existing.quantity.toFixed(3);
        const unitPrice = input.unitPrice ?? existing.unitPrice.toFixed(2);
        const discountPercent =
          input.discountPercent ?? existing.discountPercent.toFixed(2);
        const lineTotal = this.lineTotal({
          quantity,
          unitPrice,
          discountPercent,
        });

        const item = await tenant.opportunityItem.update({
          where: { id: existing.id },
          data: {
            quantity: new Prisma.Decimal(quantity),
            unitPrice: new Prisma.Decimal(unitPrice),
            discountPercent: new Prisma.Decimal(discountPercent),
            lineTotal: new Prisma.Decimal(lineTotal),
            updatedBy: context.actorUserId,
          },
        });

        const after = await this.recalculate(
          tenant,
          opportunityId,
          input.version,
          context
        );
        return { before, after, item, previousItem: existing };
      }
    );

    await this.recordAudit("opportunity.item_updated", outcome, context, {
      before: this.toAuditItem(outcome.previousItem),
      after: this.toAuditItem(outcome.item),
    });

    return {
      item: this.toPublicItem(outcome.item),
      opportunity: this.toPublicOpportunity(outcome.after),
    };
  }

  async remove(
    opportunityId: string,
    itemId: string,
    version: number,
    context: OpportunityAdministrationContext
  ) {
    const outcome = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const before = await this.requireOpportunity(
          tenant,
          opportunityId,
          context.organizationId
        );
        const item = await this.requireItem(
          tenant,
          opportunityId,
          itemId,
          context.organizationId
        );
        await tenant.opportunityItem.delete({ where: { id: item.id } });

        const after = await this.recalculate(
          tenant,
          opportunityId,
          version,
          context
        );
        return { before, after, item };
      }
    );

    await this.recordAudit("opportunity.item_removed", outcome, context, {
      before: this.toAuditItem(outcome.item),
    });

    return { opportunity: this.toPublicOpportunity(outcome.after) };
  }

  private async recalculate(
    tenant: Prisma.TransactionClient,
    opportunityId: string,
    expectedVersion: number,
    context: OpportunityAdministrationContext
  ) {
    const aggregate = await tenant.opportunityItem.aggregate({
      where: { organizationId: context.organizationId, opportunityId },
      _sum: { lineTotal: true },
    });
    const total = aggregate._sum.lineTotal ?? new Prisma.Decimal(0);
    if (total.greaterThan(new Prisma.Decimal(formatCents(MAX_MONEY_CENTS)))) {
      this.valueTooLarge();
    }

    const result = await tenant.opportunity.updateMany({
      where: {
        id: opportunityId,
        organizationId: context.organizationId,
        deletedAt: null,
        version: expectedVersion,
      },
      data: {
        estimatedValue: total,
        updatedBy: context.actorUserId,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      // Lançar aqui desfaz a mutação do item (mesma transação).
      throw new ConflictException({
        code: "OPPORTUNITY_VERSION_CONFLICT",
        message: "A oportunidade foi alterada por outra operação.",
      });
    }

    return this.requireOpportunity(
      tenant,
      opportunityId,
      context.organizationId
    );
  }

  private lineTotal(input: {
    quantity: string;
    unitPrice: string;
    discountPercent: string;
  }): string {
    const cents = calculateLineTotalCents(input);
    if (cents > MAX_MONEY_CENTS) {
      this.valueTooLarge();
    }
    return formatCents(cents);
  }

  private valueTooLarge(): never {
    throw new BadRequestException({
      code: "OPPORTUNITY_VALUE_TOO_LARGE",
      message: "O valor calculado excede o limite suportado.",
    });
  }

  private async recordAudit(
    action: string,
    outcome: {
      before: OpportunityRecord;
      after: OpportunityRecord;
      item: ItemRecord;
    },
    context: OpportunityAdministrationContext,
    snapshots: { before?: object; after?: object }
  ) {
    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      entityType: "opportunity_item",
      entityId: outcome.item.id,
      ...(snapshots.before ? { before: snapshots.before } : {}),
      ...(snapshots.after ? { after: snapshots.after } : {}),
      metadata: {
        opportunityId: outcome.after.id,
        previousEstimatedValue: outcome.before.estimatedValue.toFixed(2),
        estimatedValue: outcome.after.estimatedValue.toFixed(2),
        previousVersion: outcome.before.version,
        version: outcome.after.version,
      },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private async requireOpportunity(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const opportunity = await tenant.opportunity.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!opportunity) {
      throw new NotFoundException({
        code: "OPPORTUNITY_NOT_FOUND",
        message: "Oportunidade não encontrada.",
      });
    }
    return opportunity;
  }

  private async requireItem(
    tenant: Prisma.TransactionClient,
    opportunityId: string,
    itemId: string,
    organizationId: string
  ) {
    const item = await tenant.opportunityItem.findFirst({
      where: { id: itemId, opportunityId, organizationId },
    });
    if (!item) {
      throw new NotFoundException({
        code: "OPPORTUNITY_ITEM_NOT_FOUND",
        message: "Item da oportunidade não encontrado.",
      });
    }
    return item;
  }

  private toPublicItem<T extends ItemRecord>(item: T) {
    return {
      ...item,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      discountPercent: item.discountPercent.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    };
  }

  private toPublicOpportunity<T extends OpportunityRecord>(opportunity: T) {
    return {
      ...opportunity,
      estimatedValue: opportunity.estimatedValue.toFixed(2),
    };
  }

  private toAuditItem(item: ItemRecord) {
    return {
      productId: item.productId,
      description: item.description,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      discountPercent: item.discountPercent.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    };
  }
}

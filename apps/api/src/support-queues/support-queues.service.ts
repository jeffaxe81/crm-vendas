import {
  TICKET_OPEN_STATUSES,
  type SupportQueueCreateInput,
  type SupportQueueListQuery,
  type SupportQueueUpdateInput,
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

export type SupportQueueAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type SupportQueueRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  autoAssign: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * C5.2 — filas de atendimento. Nome único por tenant (sem diferenciar
 * caixa) entre filas não excluídas; exclusão lógica só sem solicitações
 * abertas na fila.
 */
@Injectable()
export class SupportQueuesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(query: SupportQueueListQuery, organizationId: string) {
    const items = await this.prisma.withTenant(organizationId, async tenant => {
      const queues = await tenant.supportQueue.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(query.active !== undefined ? { isActive: query.active } : {}),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const counts = await this.openCounts(
        tenant,
        organizationId,
        queues.map(queue => queue.id)
      );
      return queues.map(queue =>
        this.toPublic(queue, counts.get(queue.id) ?? 0)
      );
    });
    return { items };
  }

  async read(id: string, organizationId: string) {
    return this.prisma.withTenant(organizationId, async tenant => {
      const queue = await this.requireQueue(tenant, id, organizationId);
      const counts = await this.openCounts(tenant, organizationId, [id]);
      return this.toPublic(queue, counts.get(id) ?? 0);
    });
  }

  async create(
    input: SupportQueueCreateInput,
    context: SupportQueueAdministrationContext
  ) {
    const queue = await this.withUniqueName(() =>
      this.prisma.withTenant(context.organizationId, async tenant => {
        await this.assertNameAvailable(
          tenant,
          input.name,
          context.organizationId
        );
        return tenant.supportQueue.create({
          data: {
            organizationId: context.organizationId,
            name: input.name,
            description: input.description ?? null,
            isActive: input.isActive,
            autoAssign: input.autoAssign,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });
      })
    );

    await this.recordAudit("support_queue.created", queue.id, context, {
      after: this.toAudit(queue),
    });
    return this.toPublic(queue, 0);
  }

  async update(
    id: string,
    input: SupportQueueUpdateInput,
    context: SupportQueueAdministrationContext
  ) {
    const { before, after, openCount } = await this.withUniqueName(() =>
      this.prisma.withTenant(context.organizationId, async tenant => {
        const existing = await this.requireQueue(
          tenant,
          id,
          context.organizationId
        );

        if (
          input.name !== undefined &&
          input.name.toLocaleLowerCase("pt-BR") !==
            existing.name.toLocaleLowerCase("pt-BR")
        ) {
          await this.assertNameAvailable(
            tenant,
            input.name,
            context.organizationId,
            id
          );
        }

        const result = await tenant.supportQueue.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.isActive !== undefined
              ? { isActive: input.isActive }
              : {}),
            ...(input.autoAssign !== undefined
              ? { autoAssign: input.autoAssign }
              : {}),
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          this.versionConflict();
        }

        const updated = await this.requireQueue(
          tenant,
          id,
          context.organizationId
        );
        const counts = await this.openCounts(tenant, context.organizationId, [
          id,
        ]);
        return {
          before: existing,
          after: updated,
          openCount: counts.get(id) ?? 0,
        };
      })
    );

    await this.recordAudit("support_queue.updated", id, context, {
      before: this.toAudit(before),
      after: this.toAudit(after),
    });
    return this.toPublic(after, openCount);
  }

  async remove(id: string, context: SupportQueueAdministrationContext) {
    const { before, after } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireQueue(
          tenant,
          id,
          context.organizationId
        );
        // Trava a linha da fila: impede que uma abertura concorrente
        // (que valida a fila na mesma transação) escape do bloqueio.
        await tenant.$queryRaw`
          SELECT id FROM support_queues
          WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid
          FOR UPDATE
        `;
        const open = await tenant.ticket.count({
          where: {
            organizationId: context.organizationId,
            queueId: id,
            deletedAt: null,
            status: { in: [...TICKET_OPEN_STATUSES] },
          },
        });
        if (open > 0) {
          throw new ConflictException({
            code: "SUPPORT_QUEUE_HAS_OPEN_TICKETS",
            message: `A fila possui ${open} solicitação(ões) aberta(s) e não pode ser excluída.`,
          });
        }
        const deleted = await tenant.supportQueue.update({
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

    await this.recordAudit("support_queue.deleted", id, context, {
      before: this.toAudit(before),
      after: {
        ...this.toAudit(after),
        deletedAt: after.deletedAt?.toISOString() ?? null,
        deletedBy: after.deletedBy,
      },
    });
  }

  private async openCounts(
    tenant: Prisma.TransactionClient,
    organizationId: string,
    queueIds: string[]
  ): Promise<Map<string, number>> {
    if (queueIds.length === 0) {
      return new Map();
    }
    const rows = await tenant.ticket.groupBy({
      by: ["queueId"],
      where: {
        organizationId,
        deletedAt: null,
        queueId: { in: queueIds },
        status: { in: [...TICKET_OPEN_STATUSES] },
      },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter(row => row.queueId !== null)
        .map(row => [row.queueId as string, row._count._all])
    );
  }

  private async requireQueue(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const queue = await tenant.supportQueue.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!queue) {
      throw new NotFoundException({
        code: "SUPPORT_QUEUE_NOT_FOUND",
        message: "Fila de atendimento não encontrada.",
      });
    }
    return queue;
  }

  private async assertNameAvailable(
    tenant: Prisma.TransactionClient,
    name: string,
    organizationId: string,
    exceptId?: string
  ) {
    const clash = await tenant.supportQueue.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      this.nameConflict();
    }
  }

  /** Converte violação do índice único (corrida entre requisições) em 409. */
  private async withUniqueName<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        this.nameConflict();
      }
      throw error;
    }
  }

  private nameConflict(): never {
    throw new ConflictException({
      code: "SUPPORT_QUEUE_NAME_CONFLICT",
      message: "Já existe uma fila com este nome.",
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: "SUPPORT_QUEUE_VERSION_CONFLICT",
      message: "A fila foi alterada por outra operação.",
    });
  }

  private recordAudit(
    action: string,
    queueId: string,
    context: SupportQueueAdministrationContext,
    snapshots: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue }
  ) {
    return this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      entityType: "support_queue",
      entityId: queueId,
      ...snapshots,
      ipAddress: context.ipAddress ?? null,
    });
  }

  private toPublic(queue: SupportQueueRecord, openTicketCount: number) {
    return {
      id: queue.id,
      name: queue.name,
      description: queue.description,
      isActive: queue.isActive,
      autoAssign: queue.autoAssign,
      version: queue.version,
      openTicketCount,
      createdAt: queue.createdAt,
      updatedAt: queue.updatedAt,
    };
  }

  private toAudit(queue: SupportQueueRecord) {
    return {
      name: queue.name,
      description: queue.description,
      isActive: queue.isActive,
      autoAssign: queue.autoAssign,
      version: queue.version,
    };
  }
}

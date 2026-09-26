import {
  TICKET_FINAL_STATUSES,
  TICKET_OPEN_STATUSES,
  canTransitionTicket,
  formatTicketProtocol,
  type MembershipRole,
  type TicketAssignToMeInput,
  type TicketCommentInput,
  type TicketCreateInput,
  type TicketListQuery,
  type TicketStatus,
  type TicketStatusChangeInput,
  type TicketUpdateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { roleHasPermission } from "../authorization/permissions";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type TicketAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type TicketRecord = {
  id: string;
  protocol: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: string;
  channel: string;
  companyId: string | null;
  contactId: string | null;
  assigneeUserId: string | null;
  queueId: string | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  version: number;
};

/** Ano do protocolo no fuso de Brasília (produto brasileiro). */
export function protocolYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(now)
  );
}

const MEMBERSHIP_ROLES: readonly MembershipRole[] = [
  "ADMIN",
  "MANAGER",
  "SELLER",
  "VIEWER",
];

/** Perfis elegíveis à distribuição automática (C5.2): os com `ticket.write`. */
export const AUTO_ASSIGN_ROLES: readonly MembershipRole[] =
  MEMBERSHIP_ROLES.filter(role => roleHasPermission(role, "ticket.write"));

/**
 * C5.1 — solicitações de atendimento. Toda mutação grava um evento na
 * timeline na mesma transação, usa `version` como trava otimista e é
 * auditada.
 */
@Injectable()
export class TicketsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(
    query: TicketListQuery,
    organizationId: string,
    actorUserId?: string
  ) {
    const q = query.q?.trim();
    const assigneeUserId =
      query.assigneeUserId === "me" ? actorUserId : query.assigneeUserId;
    if (query.assigneeUserId === "me" && !actorUserId) {
      throw new Error("assigneeUserId=me requires the authenticated user.");
    }
    const where: Prisma.TicketWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(assigneeUserId ? { assigneeUserId } : {}),
      ...(query.queueId ? { queueId: query.queueId } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(q
        ? {
            OR: [
              { protocol: { contains: q, mode: "insensitive" as const } },
              { subject: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.withTenant(
      organizationId,
      tenant =>
        Promise.all([
          tenant.ticket.findMany({
            where,
            orderBy: [{ [query.sortBy]: query.sortOrder }, { id: "asc" }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tenant.ticket.count({ where }),
        ])
    );

    return { items, page: query.page, limit: query.limit, total };
  }

  async read(id: string, organizationId: string) {
    return this.prisma.withTenant(organizationId, tenant =>
      this.requireTicket(tenant, id, organizationId)
    );
  }

  async listEvents(id: string, organizationId: string) {
    const items = await this.prisma.withTenant(organizationId, async tenant => {
      await this.requireTicket(tenant, id, organizationId);
      return tenant.ticketEvent.findMany({
        where: { organizationId, ticketId: id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    });
    return { items };
  }

  async create(
    input: TicketCreateInput,
    context: TicketAdministrationContext,
    now: Date = new Date()
  ) {
    const ticket = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        await this.validateReferences(
          tenant,
          {
            companyId: input.companyId ?? null,
            contactId: input.contactId ?? null,
            assigneeUserId: input.assigneeUserId ?? null,
          },
          context.organizationId
        );

        const queue = input.queueId
          ? await this.requireActiveQueue(
              tenant,
              input.queueId,
              context.organizationId
            )
          : null;
        const autoAssigneeUserId =
          queue?.autoAssign && !input.assigneeUserId
            ? await this.pickAutoAssignee(
                tenant,
                queue.id,
                context.organizationId
              )
            : null;
        const assigneeUserId =
          input.assigneeUserId ?? autoAssigneeUserId ?? null;

        const year = protocolYear(now);
        const [counter] = await tenant.$queryRaw<{ last_value: number }[]>`
          INSERT INTO ticket_protocol_counters (organization_id, year, last_value)
          VALUES (${context.organizationId}::uuid, ${year}, 1)
          ON CONFLICT (organization_id, year)
          DO UPDATE SET last_value = ticket_protocol_counters.last_value + 1
          RETURNING last_value
        `;
        if (!counter) {
          throw new Error("Ticket protocol counter unavailable.");
        }

        const created = await tenant.ticket.create({
          data: {
            organizationId: context.organizationId,
            protocol: formatTicketProtocol(year, Number(counter.last_value)),
            subject: input.subject,
            description: input.description ?? null,
            priority: input.priority,
            channel: input.channel,
            companyId: input.companyId ?? null,
            contactId: input.contactId ?? null,
            assigneeUserId,
            queueId: queue?.id ?? null,
            openedAt: now,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });

        await this.addEvent(tenant, created.id, context, {
          type: "CREATED",
          toStatus: created.status,
          ...(queue ? { metadata: { queueId: queue.id } } : {}),
        });
        if (autoAssigneeUserId) {
          await this.addEvent(tenant, created.id, context, {
            type: "ASSIGNED",
            metadata: {
              fromAssigneeUserId: null,
              toAssigneeUserId: autoAssigneeUserId,
              autoAssigned: true,
              queueId: queue?.id ?? null,
            },
          });
        }
        return created;
      }
    );

    await this.recordAudit("ticket.created", ticket.id, context, {
      after: this.toAudit(ticket),
    });
    return ticket;
  }

  async update(
    id: string,
    input: TicketUpdateInput,
    context: TicketAdministrationContext
  ) {
    const { before, after } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );
        this.assertNotFinal(existing.status);

        await this.validateReferences(
          tenant,
          {
            companyId:
              input.companyId !== undefined
                ? input.companyId
                : existing.companyId,
            contactId:
              input.contactId !== undefined
                ? input.contactId
                : existing.contactId,
            assigneeUserId:
              input.assigneeUserId !== undefined
                ? input.assigneeUserId
                : existing.assigneeUserId,
          },
          context.organizationId
        );

        const queueChanged =
          input.queueId !== undefined && input.queueId !== existing.queueId;
        if (queueChanged && input.queueId) {
          await this.requireActiveQueue(
            tenant,
            input.queueId,
            context.organizationId
          );
        }

        const { version, ...changes } = input;
        await this.bumpVersion(tenant, id, version, context, changes);
        const updated = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );

        const changedFields = Object.keys(changes).filter(
          key => changes[key as keyof typeof changes] !== undefined
        );
        const assigneeChanged =
          input.assigneeUserId !== undefined &&
          input.assigneeUserId !== existing.assigneeUserId;

        if (assigneeChanged) {
          await this.addEvent(tenant, id, context, {
            type: "ASSIGNED",
            metadata: {
              fromAssigneeUserId: existing.assigneeUserId,
              toAssigneeUserId: updated.assigneeUserId,
            },
          });
        }
        if (queueChanged) {
          await this.addEvent(tenant, id, context, {
            type: "UPDATED",
            metadata: {
              fields: ["queueId"],
              fromQueueId: existing.queueId,
              toQueueId: updated.queueId,
            },
          });
        }
        const otherFields = changedFields.filter(
          field => field !== "assigneeUserId" && field !== "queueId"
        );
        if (otherFields.length > 0) {
          await this.addEvent(tenant, id, context, {
            type: "UPDATED",
            metadata: { fields: otherFields },
          });
        }

        return { before: existing, after: updated };
      }
    );

    await this.recordAudit("ticket.updated", id, context, {
      before: this.toAudit(before),
      after: this.toAudit(after),
    });
    return after;
  }

  /**
   * C5.2 — o usuário autenticado assume a solicitação. Idempotente quando
   * ele já é o responsável (a versão ainda é conferida).
   */
  async assignToMe(
    id: string,
    input: TicketAssignToMeInput,
    context: TicketAdministrationContext
  ) {
    const result = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );
        this.assertNotFinal(existing.status);
        if (existing.version !== input.version) {
          this.versionConflictError();
        }
        if (existing.assigneeUserId === context.actorUserId) {
          return { before: existing, after: existing, changed: false };
        }
        await this.validateReferences(
          tenant,
          {
            companyId: null,
            contactId: null,
            assigneeUserId: context.actorUserId,
          },
          context.organizationId
        );
        await this.bumpVersion(tenant, id, input.version, context, {
          assigneeUserId: context.actorUserId,
        });
        await this.addEvent(tenant, id, context, {
          type: "ASSIGNED",
          metadata: {
            fromAssigneeUserId: existing.assigneeUserId,
            toAssigneeUserId: context.actorUserId,
            selfAssigned: true,
          },
        });
        const updated = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );
        return { before: existing, after: updated, changed: true };
      }
    );

    if (result.changed) {
      await this.recordAudit("ticket.assigned_to_me", id, context, {
        before: this.toAudit(result.before),
        after: this.toAudit(result.after),
      });
    }
    return result.after;
  }

  async changeStatus(
    id: string,
    input: TicketStatusChangeInput,
    context: TicketAdministrationContext,
    now: Date = new Date()
  ) {
    const { before, after } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );

        if (!canTransitionTicket(existing.status, input.status)) {
          throw new BadRequestException({
            code: "TICKET_INVALID_TRANSITION",
            message: `Transição de ${existing.status} para ${input.status} não permitida.`,
          });
        }

        await this.bumpVersion(tenant, id, input.version, context, {
          status: input.status,
          ...(existing.firstResponseAt === null && existing.status === "OPEN"
            ? { firstResponseAt: now }
            : {}),
          ...(input.status === "RESOLVED" ? { resolvedAt: now } : {}),
          ...(existing.status === "RESOLVED" && input.status === "IN_PROGRESS"
            ? { resolvedAt: null }
            : {}),
          ...(input.status === "CLOSED" ? { closedAt: now } : {}),
        });

        await this.addEvent(tenant, id, context, {
          type: "STATUS_CHANGED",
          fromStatus: existing.status,
          toStatus: input.status,
          body: input.note ?? null,
        });

        const updated = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );
        return { before: existing, after: updated };
      }
    );

    await this.recordAudit("ticket.status_changed", id, context, {
      before: this.toAudit(before),
      after: this.toAudit(after),
    });
    return after;
  }

  async comment(
    id: string,
    input: TicketCommentInput,
    context: TicketAdministrationContext,
    now: Date = new Date()
  ) {
    const { ticket, event } = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const existing = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );
        if (
          !input.isInternal &&
          TICKET_FINAL_STATUSES.includes(existing.status)
        ) {
          throw new BadRequestException({
            code: "TICKET_FINAL",
            message:
              "Solicitação encerrada aceita apenas comentários internos.",
          });
        }

        await this.bumpVersion(tenant, id, input.version, context, {
          ...(!input.isInternal && existing.firstResponseAt === null
            ? { firstResponseAt: now }
            : {}),
        });
        const created = await this.addEvent(tenant, id, context, {
          type: "COMMENT",
          body: input.body,
          isInternal: input.isInternal,
        });
        const updated = await this.requireTicket(
          tenant,
          id,
          context.organizationId
        );
        return { ticket: updated, event: created };
      }
    );

    await this.recordAudit("ticket.commented", id, context, {
      after: { eventId: event.id, isInternal: event.isInternal },
    });
    return { ticket, event };
  }

  private async bumpVersion(
    tenant: Prisma.TransactionClient,
    id: string,
    version: number,
    context: TicketAdministrationContext,
    data: Prisma.TicketUncheckedUpdateManyInput
  ) {
    const result = await tenant.ticket.updateMany({
      where: {
        id,
        organizationId: context.organizationId,
        deletedAt: null,
        version,
      },
      data: {
        ...data,
        updatedBy: context.actorUserId,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      this.versionConflictError();
    }
  }

  private versionConflictError(): never {
    throw new ConflictException({
      code: "TICKET_VERSION_CONFLICT",
      message: "A solicitação foi alterada por outra operação.",
    });
  }

  /**
   * Valida que a fila existe no tenant, não foi excluída e está ativa.
   * `FOR SHARE` serializa com a exclusão da fila (que usa `FOR UPDATE`).
   */
  private async requireActiveQueue(
    tenant: Prisma.TransactionClient,
    queueId: string,
    organizationId: string
  ) {
    const [queue] = await tenant.$queryRaw<
      {
        id: string;
        is_active: boolean;
        auto_assign: boolean;
        deleted_at: Date | null;
      }[]
    >`
      SELECT id, is_active, auto_assign, deleted_at
      FROM support_queues
      WHERE id = ${queueId}::uuid AND organization_id = ${organizationId}::uuid
      FOR SHARE
    `;
    if (!queue || queue.deleted_at !== null) {
      throw new NotFoundException({
        code: "SUPPORT_QUEUE_NOT_FOUND",
        message: "Fila de atendimento não encontrada.",
      });
    }
    if (!queue.is_active) {
      throw new BadRequestException({
        code: "SUPPORT_QUEUE_INACTIVE",
        message: "A fila de atendimento está inativa.",
      });
    }
    return { id: queue.id, autoAssign: queue.auto_assign };
  }

  /**
   * C5.2 — distribuição automática: membro ativo (membership e usuário
   * ativos) com `ticket.write` e menos solicitações abertas na fila.
   * Desempate: membership mais antiga na organização (`created_at`) e, por
   * fim, menor `user_id`. Um lock consultivo por fila serializa aberturas
   * concorrentes para que a contagem considere a atribuição anterior.
   */
  private async pickAutoAssignee(
    tenant: Prisma.TransactionClient,
    queueId: string,
    organizationId: string
  ): Promise<string | null> {
    await tenant.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`support_queue:${queueId}`}, 0))
    `;
    const roles = [...AUTO_ASSIGN_ROLES];
    const statuses = [...TICKET_OPEN_STATUSES];
    const [candidate] = await tenant.$queryRaw<{ user_id: string }[]>`
      SELECT m.user_id
      FROM organization_memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN tickets t
        ON t.organization_id = m.organization_id
       AND t.assignee_user_id = m.user_id
       AND t.queue_id = ${queueId}::uuid
       AND t.deleted_at IS NULL
       AND t.status::text = ANY(${statuses}::text[])
      WHERE m.organization_id = ${organizationId}::uuid
        AND m.is_active
        AND u.is_active
        AND m.role::text = ANY(${roles}::text[])
      GROUP BY m.user_id, m.created_at
      ORDER BY count(t.id) ASC, m.created_at ASC, m.user_id ASC
      LIMIT 1
    `;
    return candidate?.user_id ?? null;
  }

  private addEvent(
    tenant: Prisma.TransactionClient,
    ticketId: string,
    context: TicketAdministrationContext,
    event: {
      type: "CREATED" | "COMMENT" | "STATUS_CHANGED" | "ASSIGNED" | "UPDATED";
      body?: string | null;
      isInternal?: boolean;
      fromStatus?: TicketStatus;
      toStatus?: TicketStatus;
      metadata?: Prisma.InputJsonValue;
    }
  ) {
    return tenant.ticketEvent.create({
      data: {
        organizationId: context.organizationId,
        ticketId,
        type: event.type,
        body: event.body ?? null,
        isInternal: event.isInternal ?? false,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
        authorUserId: context.actorUserId,
      },
    });
  }

  private async validateReferences(
    tenant: Prisma.TransactionClient,
    references: {
      companyId: string | null;
      contactId: string | null;
      assigneeUserId: string | null;
    },
    organizationId: string
  ) {
    const [company, contact, membership] = await Promise.all([
      references.companyId
        ? tenant.company.findFirst({
            where: {
              id: references.companyId,
              organizationId,
              deletedAt: null,
            },
            select: { id: true },
          })
        : Promise.resolve({ id: "none" }),
      references.contactId
        ? tenant.contact.findFirst({
            where: {
              id: references.contactId,
              organizationId,
              deletedAt: null,
            },
            select: { id: true },
          })
        : Promise.resolve({ id: "none" }),
      references.assigneeUserId
        ? tenant.organizationMembership.findFirst({
            where: {
              organizationId,
              userId: references.assigneeUserId,
              isActive: true,
            },
            select: { id: true },
          })
        : Promise.resolve({ id: "none" }),
    ]);

    if (!company || !contact || !membership) {
      throw new NotFoundException({
        code: "TICKET_REFERENCE_NOT_FOUND",
        message: "Cliente ou responsável não encontrado nesta organização.",
      });
    }
  }

  private assertNotFinal(status: TicketStatus) {
    if (TICKET_FINAL_STATUSES.includes(status)) {
      throw new BadRequestException({
        code: "TICKET_FINAL",
        message: "Solicitação encerrada não pode ser alterada.",
      });
    }
  }

  private async requireTicket(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const ticket = await tenant.ticket.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: "TICKET_NOT_FOUND",
        message: "Solicitação não encontrada.",
      });
    }
    return ticket;
  }

  private recordAudit(
    action: string,
    ticketId: string,
    context: TicketAdministrationContext,
    snapshots: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue }
  ) {
    return this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      entityType: "ticket",
      entityId: ticketId,
      ...snapshots,
      ipAddress: context.ipAddress ?? null,
    });
  }

  private toAudit(ticket: TicketRecord) {
    return {
      protocol: ticket.protocol,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      channel: ticket.channel,
      companyId: ticket.companyId,
      contactId: ticket.contactId,
      assigneeUserId: ticket.assigneeUserId,
      queueId: ticket.queueId,
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      version: ticket.version,
    };
  }
}

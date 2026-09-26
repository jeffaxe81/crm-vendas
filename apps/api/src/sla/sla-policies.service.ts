import type {
  SlaPolicy,
  SlaPolicyUpsertInput,
  TicketPriority,
} from "@axes/contracts";
import { ConflictException, Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export type SlaPolicyAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

type SlaPolicyRecord = {
  id: string;
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  isActive: boolean;
  version: number;
  updatedAt: Date;
};

const PRIORITY_ORDER: readonly TicketPriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
];

/**
 * C5.3 — políticas de SLA: uma por prioridade e organização, criadas ou
 * editadas por upsert (edição exige `version`). Mudanças valem para novas
 * aberturas e mudanças de prioridade; não recalculam solicitações existentes.
 */
@Injectable()
export class SlaPoliciesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(organizationId: string): Promise<{ items: SlaPolicy[] }> {
    const items = await this.prisma.withTenant(organizationId, tenant =>
      tenant.slaPolicy.findMany({ where: { organizationId } })
    );
    return {
      items: items
        .sort(
          (left, right) =>
            PRIORITY_ORDER.indexOf(left.priority) -
            PRIORITY_ORDER.indexOf(right.priority)
        )
        .map(item => this.toPublic(item)),
    };
  }

  async upsert(
    priority: TicketPriority,
    input: SlaPolicyUpsertInput,
    context: SlaPolicyAdministrationContext
  ): Promise<{ policy: SlaPolicy; created: boolean }> {
    const { before, after } = await this.withUniquePriority(() =>
      this.prisma.withTenant(context.organizationId, async tenant => {
        const existing = await tenant.slaPolicy.findFirst({
          where: { organizationId: context.organizationId, priority },
        });

        if (!existing) {
          if (input.version !== undefined) {
            throw this.conflict();
          }
          const created = await tenant.slaPolicy.create({
            data: {
              organizationId: context.organizationId,
              priority,
              firstResponseMinutes: input.firstResponseMinutes,
              resolutionMinutes: input.resolutionMinutes,
              isActive: input.isActive,
              createdBy: context.actorUserId,
              updatedBy: context.actorUserId,
            },
          });
          return { before: null, after: created };
        }

        if (input.version === undefined) {
          throw this.conflict();
        }
        const result = await tenant.slaPolicy.updateMany({
          where: {
            id: existing.id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: {
            firstResponseMinutes: input.firstResponseMinutes,
            resolutionMinutes: input.resolutionMinutes,
            isActive: input.isActive,
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw this.conflict();
        }
        const updated = await tenant.slaPolicy.findFirstOrThrow({
          where: { id: existing.id, organizationId: context.organizationId },
        });
        return { before: existing, after: updated };
      })
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: before ? "sla_policy.updated" : "sla_policy.created",
      entityType: "sla_policy",
      entityId: after.id,
      ...(before ? { before: this.toAudit(before) } : {}),
      after: this.toAudit(after),
      ipAddress: context.ipAddress ?? null,
    });

    return { policy: this.toPublic(after), created: before === null };
  }

  private conflict() {
    return new ConflictException({
      code: "SLA_POLICY_VERSION_CONFLICT",
      message:
        "A política de SLA foi alterada por outra operação. Recarregue e tente novamente.",
    });
  }

  /** Criação concorrente da mesma prioridade vira 409, não 500. */
  private async withUniquePriority<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw this.conflict();
      }
      throw error;
    }
  }

  private toPublic(policy: SlaPolicyRecord): SlaPolicy {
    return {
      id: policy.id,
      priority: policy.priority,
      firstResponseMinutes: policy.firstResponseMinutes,
      resolutionMinutes: policy.resolutionMinutes,
      isActive: policy.isActive,
      version: policy.version,
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  private toAudit(policy: SlaPolicyRecord) {
    return {
      priority: policy.priority,
      firstResponseMinutes: policy.firstResponseMinutes,
      resolutionMinutes: policy.resolutionMinutes,
      isActive: policy.isActive,
      version: policy.version,
    };
  }
}

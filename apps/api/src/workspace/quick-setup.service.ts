import {
  QuickSetupProgressInputSchema,
  QuickSetupStepIdSchema,
  type QuickSetupState,
  type QuickSetupStep,
  type QuickSetupStepId,
} from "@axes/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import type { Permission } from "../authorization/permissions";
import { PrismaService } from "../database/prisma.service";

type QuickSetupContext = {
  principal: AuthenticatedPrincipal;
  requestId: string;
  ipAddress?: string | null;
};

type StepDefinition = QuickSetupStep & {
  requiredAny?: readonly Permission[];
  requiredAll?: readonly Permission[];
};

const STEP_DEFINITIONS: readonly StepDefinition[] = [
  {
    id: "organization",
    title: "Organização",
    description: "Confirme a organização ativa e os dados administrativos.",
    destination: "home",
    requiredAll: ["organization.manage"],
  },
  {
    id: "team",
    title: "Equipe e perfis",
    description: "Revise usuários e atribua os perfis necessários.",
    destination: "admin-users",
    requiredAll: ["user.manage"],
  },
  {
    id: "sales-structure",
    title: "Estrutura comercial",
    description:
      "Revise pipeline, produtos e relatórios disponíveis para a operação.",
    destination: "opportunities",
    requiredAny: ["pipeline.manage", "reports.read", "product.write"],
  },
  {
    id: "commercial-data",
    title: "Dados comerciais",
    description:
      "Prepare tags, campos customizáveis, empresas e contatos essenciais.",
    destination: "companies",
    requiredAny: ["company.write", "contact.write"],
  },
  {
    id: "help",
    title: "Ajuda por perfil",
    description: "Revise as orientações adequadas às suas permissões.",
    destination: "home",
  },
  {
    id: "review",
    title: "Validação final",
    description: "Confira o resumo e conclua a configuração rápida.",
    destination: "home",
  },
];

@Injectable()
export class QuickSetupService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(principal: AuthenticatedPrincipal): Promise<QuickSetupState> {
    this.requireUser(principal);
    return this.prisma.withTenant(principal.organizationId, async tenant => {
      const membership = await tenant.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        },
      });
      return this.stateFromMembership(principal, membership);
    });
  }

  async progress(
    body: unknown,
    context: QuickSetupContext
  ): Promise<QuickSetupState> {
    this.requireUser(context.principal);
    const parsed = QuickSetupProgressInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Progresso da configuração inválido.");
    }

    const steps = this.availableSteps(context.principal);
    const allowedIds = new Set(steps.map(step => step.id));
    if (!allowedIds.has(parsed.data.stepId)) {
      throw new ForbiddenException(
        "Esta etapa não está autorizada para a sessão atual."
      );
    }
    if (parsed.data.complete && parsed.data.stepId !== "review") {
      throw new BadRequestException(
        "A configuração só pode ser concluída na etapa de revisão."
      );
    }

    return this.prisma.withTenant(
      context.principal.organizationId,
      async tenant => {
        const membership =
          await tenant.organizationMembership.findUniqueOrThrow({
            where: {
              organizationId_userId: {
                organizationId: context.principal.organizationId,
                userId: context.principal.userId,
              },
            },
          });

        if (membership.quickSetupCompletedAt) {
          return this.stateFromMembership(context.principal, membership);
        }

        const stored = new Set(this.parseCompletedSteps(membership));
        stored.add(parsed.data.stepId);

        const completedSteps = steps
          .map(step => step.id)
          .filter(stepId => stored.has(stepId));

        if (parsed.data.complete) {
          const missing = steps
            .map(step => step.id)
            .filter(stepId => stepId !== "review" && !stored.has(stepId));
          if (missing.length > 0) {
            throw new BadRequestException(
              "Conclua as etapas autorizadas antes da revisão final."
            );
          }
        }

        const updated = await tenant.organizationMembership.update({
          where: {
            organizationId_userId: {
              organizationId: context.principal.organizationId,
              userId: context.principal.userId,
            },
          },
          data: {
            quickSetupCompletedSteps: completedSteps,
            quickSetupCompletedAt: parsed.data.complete ? new Date() : null,
          },
        });

        await tenant.auditLog.create({
          data: {
            organizationId: context.principal.organizationId,
            actorUserId: context.principal.userId,
            requestId: context.requestId,
            action: parsed.data.complete
              ? "quick_setup.completed"
              : "quick_setup.progressed",
            entityType: "organization_membership",
            entityId: context.principal.membershipId,
            metadata: {
              stepId: parsed.data.stepId,
              completed: Boolean(parsed.data.complete),
            },
            ipAddress: context.ipAddress ?? null,
          },
        });

        return this.stateFromMembership(context.principal, updated);
      }
    );
  }

  async reopen(context: QuickSetupContext): Promise<QuickSetupState> {
    this.requireUser(context.principal);

    return this.prisma.withTenant(
      context.principal.organizationId,
      async tenant => {
        const updated = await tenant.organizationMembership.update({
          where: {
            organizationId_userId: {
              organizationId: context.principal.organizationId,
              userId: context.principal.userId,
            },
          },
          data: {
            quickSetupCompletedSteps: [],
            quickSetupCompletedAt: null,
          },
        });

        await tenant.auditLog.create({
          data: {
            organizationId: context.principal.organizationId,
            actorUserId: context.principal.userId,
            requestId: context.requestId,
            action: "quick_setup.reopened",
            entityType: "organization_membership",
            entityId: context.principal.membershipId,
            metadata: { reset: true },
            ipAddress: context.ipAddress ?? null,
          },
        });

        return this.stateFromMembership(context.principal, updated);
      }
    );
  }

  private availableSteps(principal: AuthenticatedPrincipal): QuickSetupStep[] {
    const permissions = new Set(principal.permissions);
    return STEP_DEFINITIONS.filter(step => {
      if (
        step.requiredAll &&
        !step.requiredAll.every(permission => permissions.has(permission))
      ) {
        return false;
      }
      if (
        step.requiredAny &&
        !step.requiredAny.some(permission => permissions.has(permission))
      ) {
        return false;
      }
      return true;
    }).map(({ requiredAll: _all, requiredAny: _any, ...step }) => step);
  }

  private stateFromMembership(
    principal: AuthenticatedPrincipal,
    membership: {
      quickSetupCompletedSteps: unknown;
      quickSetupCompletedAt: Date | null;
    }
  ): QuickSetupState {
    const steps = this.availableSteps(principal);
    const stored = new Set(this.parseCompletedSteps(membership));
    return {
      completed: membership.quickSetupCompletedAt !== null,
      completedSteps: steps
        .map(step => step.id)
        .filter(stepId => stored.has(stepId)),
      steps,
    };
  }

  private parseCompletedSteps(membership: {
    quickSetupCompletedSteps: unknown;
  }): QuickSetupStepId[] {
    const parsed = QuickSetupStepIdSchema.array().safeParse(
      membership.quickSetupCompletedSteps
    );
    return parsed.success ? parsed.data : [];
  }

  private requireUser(principal: AuthenticatedPrincipal): void {
    if (principal.authMethod !== "session") {
      throw new ForbiddenException(
        "Configuração rápida exige sessão de usuário."
      );
    }
  }
}

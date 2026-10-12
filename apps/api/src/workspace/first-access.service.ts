import {
  OrganizationOnboardingInputSchema,
  TourCompletionInputSchema,
  type OnboardingState,
} from "@axes/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class FirstAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireUser(principal: AuthenticatedPrincipal) {
    if (principal.authMethod !== "session")
      throw new ForbiddenException("Primeiro acesso exige sessão de usuário.");
  }

  async read(principal: AuthenticatedPrincipal): Promise<OnboardingState> {
    this.requireUser(principal);
    return this.prisma.withTenant(principal.organizationId, async tx => {
      let organization = await tx.organization.findUniqueOrThrow({
        where: { id: principal.organizationId },
      });

      // Legacy tenants: choose the oldest active administrator exactly once.
      // Atomic compare-and-set prevents two administrators from claiming setup.
      if (
        !organization.onboardingOwnerId &&
        principal.role === "ADMIN" &&
        principal.permissions.includes("organization.manage")
      ) {
        const founder = await tx.organizationMembership.findFirst({
          where: {
            organizationId: principal.organizationId,
            role: "ADMIN",
            isActive: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (founder?.userId === principal.userId) {
          await tx.organization.updateMany({
            where: { id: principal.organizationId, onboardingOwnerId: null },
            data: { onboardingOwnerId: principal.userId },
          });
          organization = await tx.organization.findUniqueOrThrow({
            where: { id: principal.organizationId },
          });
        }
      }

      const member = await tx.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        },
      });
      const eligible =
        principal.role === "ADMIN" &&
        principal.permissions.includes("organization.manage") &&
        organization.onboardingOwnerId === principal.userId;

      return {
        organization: {
          eligible,
          completed: organization.onboardingCompletedAt !== null,
          step: organization.onboardingStep,
          name: organization.name,
        },
        tour: {
          status:
            member.tourStatus === "COMPLETED" || member.tourStatus === "SKIPPED"
              ? member.tourStatus
              : "PENDING",
        },
      };
    });
  }

  async saveOrganization(
    body: unknown,
    principal: AuthenticatedPrincipal,
    requestId: string
  ): Promise<OnboardingState["organization"]> {
    this.requireUser(principal);
    const parsed = OrganizationOnboardingInputSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Etapa de configuração inválida.");
    if (
      principal.role !== "ADMIN" ||
      !principal.permissions.includes("organization.manage")
    )
      throw new ForbiddenException(
        "Somente o administrador inicial pode configurar a empresa."
      );

    return this.prisma.withTenant(principal.organizationId, async tx => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: principal.organizationId },
      });
      if (org.onboardingOwnerId !== principal.userId)
        throw new ForbiddenException(
          "Configuração inicial reservada ao primeiro administrador."
        );
      if (org.onboardingCompletedAt) {
        return {
          eligible: true,
          completed: true,
          step: org.onboardingStep,
          name: org.name,
        };
      }
      if (
        parsed.data.step < org.onboardingStep ||
        parsed.data.step > org.onboardingStep + 1 ||
        (parsed.data.complete === true && parsed.data.step !== 4)
      )
        throw new BadRequestException("Sequência inválida do assistente.");
      const updated = await tx.organization.update({
        where: { id: principal.organizationId },
        data: {
          name: parsed.data.name ?? org.name,
          onboardingStep: parsed.data.step,
          onboardingCompletedAt: parsed.data.complete ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId,
          action: parsed.data.complete
            ? "onboarding.organization.completed"
            : "onboarding.organization.progressed",
          entityType: "organization",
          entityId: principal.organizationId,
          metadata: { step: updated.onboardingStep },
        },
      });
      return {
        eligible: true,
        completed: updated.onboardingCompletedAt !== null,
        step: updated.onboardingStep,
        name: updated.name,
      };
    });
  }

  async finishTour(
    body: unknown,
    principal: AuthenticatedPrincipal,
    requestId: string
  ): Promise<OnboardingState["tour"]> {
    this.requireUser(principal);
    const parsed = TourCompletionInputSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Estado do tour inválido.");
    return this.prisma.withTenant(principal.organizationId, async tx => {
      // First completion/skip wins: replays cannot erase prior completion.
      const updated = await tx.organizationMembership.updateMany({
        where: {
          organizationId: principal.organizationId,
          userId: principal.userId,
          isActive: true,
          tourStatus: "PENDING",
        },
        data: { tourStatus: parsed.data.status },
      });
      if (updated.count === 1)
        await tx.auditLog.create({
          data: {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            requestId,
            action: "onboarding.tour.finished",
            entityType: "organization_membership",
            entityId: principal.membershipId,
            metadata: { status: parsed.data.status },
          },
        });
      const member = await tx.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        },
      });
      return {
        status:
          member.tourStatus === "COMPLETED" || member.tourStatus === "SKIPPED"
            ? member.tourStatus
            : "PENDING",
      };
    });
  }
}

import {
  MembershipRoleSchema,
  OrganizationUserResponseSchema,
  type CreateOrganizationUserInput,
  type OrganizationUserResponse,
  type UpdateOrganizationMembershipInput,
} from "@axes/contracts";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";

export type UserAdministrationContext = {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
};

@Injectable()
export class OrganizationUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(organizationId: string): Promise<OrganizationUserResponse[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: [{ user: { displayName: "asc" } }, { createdAt: "asc" }],
    });

    return memberships.map(membership =>
      OrganizationUserResponseSchema.parse({
        membershipId: membership.id,
        role: MembershipRoleSchema.parse(membership.role),
        isActive: membership.isActive,
        user: {
          id: membership.user.id,
          email: membership.user.email,
          displayName: membership.user.displayName,
          isActive: membership.user.isActive,
        },
      })
    );
  }

  async create(
    input: CreateOrganizationUserInput,
    context: UserAdministrationContext
  ): Promise<OrganizationUserResponse> {
    const emailNormalized = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });

    if (existing) {
      throw new ConflictException({
        code: "USER_EMAIL_ALREADY_EXISTS",
        message:
          "Já existe uma conta com este e-mail. O vínculo entre organizações será tratado por fluxo específico.",
      });
    }

    const passwordHash = await this.passwords.hash(input.password);
    const result = await this.prisma.$transaction(async transaction => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          emailNormalized,
          displayName: input.displayName,
          passwordHash,
        },
      });

      const membership = await transaction.organizationMembership.create({
        data: {
          organizationId: context.organizationId,
          userId: user.id,
          role: input.role,
        },
      });

      return { user, membership };
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "user.created",
      entityType: "organization_membership",
      entityId: result.membership.id,
      after: {
        userId: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        role: input.role,
        isActive: true,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return OrganizationUserResponseSchema.parse({
      membershipId: result.membership.id,
      role: input.role,
      isActive: result.membership.isActive,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        isActive: result.user.isActive,
      },
    });
  }

  async updateMembership(
    membershipId: string,
    input: UpdateOrganizationMembershipInput,
    context: UserAdministrationContext
  ): Promise<OrganizationUserResponse> {
    const existing = await this.prisma.organizationMembership.findFirst({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
      },
      include: { user: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: "MEMBERSHIP_NOT_FOUND",
        message: "Usuário da organização não encontrado.",
      });
    }

    const removingAdmin =
      existing.role === "ADMIN" &&
      existing.isActive &&
      (input.isActive === false ||
        (input.role !== undefined && input.role !== "ADMIN"));

    if (removingAdmin) {
      const otherActiveAdmins =
        await this.prisma.organizationMembership.count({
          where: {
            organizationId: context.organizationId,
            role: "ADMIN",
            isActive: true,
            id: { not: existing.id },
          },
        });

      if (otherActiveAdmins === 0) {
        throw new ConflictException({
          code: "LAST_ADMIN_REQUIRED",
          message:
            "A organização deve manter ao menos um Administrador ativo.",
        });
      }
    }

    const updated = await this.prisma.organizationMembership.update({
      where: { id: existing.id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined
          ? { isActive: input.isActive }
          : {}),
      },
      include: { user: true },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "membership.updated",
      entityType: "organization_membership",
      entityId: updated.id,
      before: {
        role: existing.role,
        isActive: existing.isActive,
      },
      after: {
        role: updated.role,
        isActive: updated.isActive,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return OrganizationUserResponseSchema.parse({
      membershipId: updated.id,
      role: MembershipRoleSchema.parse(updated.role),
      isActive: updated.isActive,
      user: {
        id: updated.user.id,
        email: updated.user.email,
        displayName: updated.user.displayName,
        isActive: updated.user.isActive,
      },
    });
  }
}

import {
  AuthSessionResponseSchema,
  MembershipRoleSchema,
  type AuthSessionResponse,
  type LoginInput,
  type MembershipRole,
} from "@axes/contracts";
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { permissionsForRole } from "../authorization/permissions";
import { PrismaService } from "../database/prisma.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

export type AuthenticationRequestContext = {
  requestId: string;
  ipAddress?: string | null;
};

export type AuthenticationResult = {
  response: AuthSessionResponse;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async login(
    input: LoginInput,
    context: AuthenticationRequestContext
  ): Promise<AuthenticationResult> {
    const emailNormalized = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });

    if (!user) {
      await this.passwords.verifyDummy(input.password);
      this.throwInvalidCredentials();
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      input.password
    );

    if (!passwordMatches || !user.isActive) {
      this.throwInvalidCredentials();
    }

    const organizationSlug = input.organizationSlug?.trim().toLowerCase();
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        organization: {
          isActive: true,
          ...(organizationSlug ? { slug: organizationSlug } : {}),
        },
      },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: "ORGANIZATION_ACCESS_DENIED",
        message: "Usuário sem acesso ativo à organização.",
      });
    }

    const role = MembershipRoleSchema.parse(membership.role);
    const refreshToken = this.tokens.createRefreshToken();
    const session = await this.prisma.refreshSession.create({
      data: {
        organizationId: membership.organizationId,
        userId: user.id,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiry(),
      },
    });

    const response = await this.createSessionResponse({
      user,
      membership,
      organization: membership.organization,
      role,
      sessionId: session.id,
    });

    await this.audit.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      requestId: context.requestId,
      action: "auth.login",
      entityType: "refresh_session",
      entityId: session.id,
      metadata: { role },
      ipAddress: context.ipAddress ?? null,
    });

    return { response, refreshToken };
  }

  async refresh(
    refreshToken: string,
    context: AuthenticationRequestContext
  ): Promise<AuthenticationResult> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        organization: true,
      },
    });

    if (!session) {
      this.throwInvalidSession();
    }

    const now = new Date();
    if (
      session.revokedAt ||
      session.expiresAt.getTime() <= now.getTime() ||
      !session.user.isActive ||
      !session.organization.isActive
    ) {
      await this.revokeFamily(session.familyId, now);
      this.throwInvalidSession();
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        isActive: true,
      },
    });

    if (!membership) {
      await this.revokeFamily(session.familyId, now);
      this.throwInvalidSession();
    }

    const nextRefreshToken = this.tokens.createRefreshToken();
    const nextTokenHash = this.tokens.hashRefreshToken(nextRefreshToken);

    const nextSession = await this.prisma.$transaction(async transaction => {
      const revoked = await transaction.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
        },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException({
          code: "SESSION_INVALID",
          message: "Sessão inválida ou expirada.",
        });
      }

      return transaction.refreshSession.create({
        data: {
          familyId: session.familyId,
          organizationId: session.organizationId,
          userId: session.userId,
          tokenHash: nextTokenHash,
          expiresAt: this.refreshExpiry(now),
        },
      });
    });

    const role = MembershipRoleSchema.parse(membership.role);
    const response = await this.createSessionResponse({
      user: session.user,
      membership,
      organization: session.organization,
      role,
      sessionId: nextSession.id,
    });

    await this.audit.record({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      requestId: context.requestId,
      action: "auth.refresh",
      entityType: "refresh_session",
      entityId: nextSession.id,
      metadata: { previousSessionId: session.id },
      ipAddress: context.ipAddress ?? null,
    });

    return { response, refreshToken: nextRefreshToken };
  }

  async logout(
    refreshToken: string,
    context: AuthenticationRequestContext
  ): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      return;
    }

    const result = await this.prisma.refreshSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    if (result.count === 1) {
      await this.audit.record({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        requestId: context.requestId,
        action: "auth.logout",
        entityType: "refresh_session",
        entityId: session.id,
        ipAddress: context.ipAddress ?? null,
      });
    }
  }

  private async createSessionResponse(input: {
    user: { id: string; email: string; displayName: string };
    organization: { id: string; name: string; slug: string };
    membership: { id: string };
    role: MembershipRole;
    sessionId: string;
  }): Promise<AuthSessionResponse> {
    const accessToken = await this.tokens.signAccessToken({
      sub: input.user.id,
      organizationId: input.organization.id,
      membershipId: input.membership.id,
      role: input.role,
      sessionId: input.sessionId,
    });

    return AuthSessionResponseSchema.parse({
      accessToken,
      expiresIn: this.tokens.accessTokenExpiresIn,
      user: {
        id: input.user.id,
        email: input.user.email,
        displayName: input.user.displayName,
      },
      organization: {
        id: input.organization.id,
        name: input.organization.name,
        slug: input.organization.slug,
      },
      membership: {
        id: input.membership.id,
        role: input.role,
      },
      permissions: [...permissionsForRole(input.role)],
    });
  }

  private refreshExpiry(from = new Date()): Date {
    return new Date(
      from.getTime() + this.tokens.refreshTokenExpiresIn * 1000
    );
  }

  private async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: { revokedAt },
    });
  }

  private throwInvalidCredentials(): never {
    throw new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "E-mail ou senha inválidos.",
    });
  }

  private throwInvalidSession(): never {
    throw new UnauthorizedException({
      code: "SESSION_INVALID",
      message: "Sessão inválida ou expirada.",
    });
  }
}

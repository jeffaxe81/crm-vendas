import { MembershipRoleSchema } from "@axes/contracts";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { TokenService } from "../auth/token.service";
import { PrismaService } from "../database/prisma.service";
import { API_KEY_PREFIX, hashApiKey } from "./api-key-hash";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./authenticated-request";
import { permissionsForRole, type Permission } from "./permissions";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readBearerToken(request.headers.authorization);

    if (!token) {
      this.throwAuthenticationRequired();
    }

    if (token.startsWith(API_KEY_PREFIX)) {
      return this.authenticateWithApiKey(token, request);
    }

    return this.authenticateWithSession(token, request);
  }

  private async authenticateWithSession(
    token: string,
    request: AuthenticatedRequest
  ): Promise<boolean> {
    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      this.throwAuthenticationRequired();
    }

    const now = new Date();
    const [membership, session] = await Promise.all([
      this.prisma.organizationMembership.findFirst({
        where: {
          id: payload.membershipId,
          userId: payload.sub,
          organizationId: payload.organizationId,
          isActive: true,
          user: { isActive: true },
          organization: { isActive: true },
        },
      }),
      this.prisma.refreshSession.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          organizationId: payload.organizationId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
    ]);

    if (!membership || !session) {
      this.throwAuthenticationRequired();
    }

    const role = MembershipRoleSchema.parse(membership.role);
    const principal: AuthenticatedPrincipal = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      membershipId: membership.id,
      role,
      sessionId: session.id,
      permissions: permissionsForRole(role),
      authMethod: "session",
    };

    request.auth = principal;
    return true;
  }

  /**
   * F4.1 — autentica uma credencial de máquina (API Key). As permissões
   * efetivas são a INTERSEÇÃO entre os escopos gravados na credencial e o
   * que o papel atual de quem a criou permite — de propósito, não apenas
   * uma checagem feita na criação: se o criador for rebaixado ou perder o
   * papel depois, a chave perde poder automaticamente, sem precisar ser
   * revogada manualmente.
   */
  private async authenticateWithApiKey(
    token: string,
    request: AuthenticatedRequest
  ): Promise<boolean> {
    const keyHash = hashApiKey(token);
    const credential = await this.prisma.integrationCredential.findUnique({
      where: { keyHash },
    });

    const now = new Date();
    if (
      !credential ||
      !credential.isActive ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= now)
    ) {
      this.throwAuthenticationRequired();
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: credential.organizationId,
        userId: credential.createdBy,
        isActive: true,
        user: { isActive: true },
        organization: { isActive: true },
      },
    });

    if (!membership) {
      this.throwAuthenticationRequired();
    }

    const role = MembershipRoleSchema.parse(membership.role);
    const rolePermissions = permissionsForRole(role);
    const effectivePermissions = credential.scopes.filter(
      (scope): scope is Permission =>
        rolePermissions.includes(scope as Permission)
    );

    if (effectivePermissions.length === 0) {
      this.throwAuthenticationRequired();
    }

    void this.prisma.integrationCredential
      .update({
        where: { id: credential.id },
        data: { lastUsedAt: now },
      })
      .catch(() => {
        // best-effort — nunca falhar a requisição por causa disso.
      });

    const principal: AuthenticatedPrincipal = {
      userId: credential.createdBy,
      organizationId: credential.organizationId,
      membershipId: membership.id,
      role,
      sessionId: `api_key:${credential.id}`,
      permissions: effectivePermissions,
      authMethod: "api_key",
      apiKeyId: credential.id,
    };

    request.auth = principal;
    return true;
  }

  private readBearerToken(header?: string): string | null {
    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(" ", 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return null;
    }

    return token;
  }

  private throwAuthenticationRequired(): never {
    throw new UnauthorizedException({
      code: "AUTHENTICATION_REQUIRED",
      message: "Autenticação necessária.",
    });
  }
}

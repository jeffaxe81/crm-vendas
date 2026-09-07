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
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./authenticated-request";

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

    const principal: AuthenticatedPrincipal = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      membershipId: membership.id,
      role: MembershipRoleSchema.parse(membership.role),
      sessionId: session.id,
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

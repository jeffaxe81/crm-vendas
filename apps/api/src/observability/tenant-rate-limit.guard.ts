import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { AuditService } from "../audit/audit.service";
import { TenantRateLimitService } from "./tenant-rate-limit.service";

/**
 * PHASE 3.2: Tenant Rate Limit Guard
 *
 * Global guard that enforces per-tenant and per-user rate limits.
 *
 * Limits:
 * - 1000 requests/min per tenant (organization)
 * - 50 requests/sec per user
 *
 * When limits are exceeded:
 * - Returns 429 Too Many Requests
 * - Logs violation to audit trail
 *
 * To use globally, add to app.module.ts:
 * ```
 * {
 *   provide: APP_GUARD,
 *   useClass: TenantRateLimitGuard,
 * }
 * ```
 *
 * Or apply to specific routes with @UseGuards(TenantRateLimitGuard)
 */
@Injectable()
export class TenantRateLimitGuard implements CanActivate {
  constructor(
    @Inject(TenantRateLimitService)
    private readonly rateLimiter: TenantRateLimitService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // No auth info = no rate limiting (public routes)
    if (!request.auth) {
      return true;
    }

    const organizationId = request.auth.organizationId;
    const userId = request.auth.userId;

    // Check tenant limit
    if (!this.rateLimiter.checkTenantLimit(organizationId)) {
      await this.logRateLimitViolation(request, "tenant", organizationId, userId);
      throw new HttpException(
        "Organization rate limit exceeded: 1000 requests/minute",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check user limit
    if (!this.rateLimiter.checkUserLimit(userId, organizationId)) {
      await this.logRateLimitViolation(request, "user", organizationId, userId);
      throw new HttpException(
        "User rate limit exceeded: 50 requests/second",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }

  private async logRateLimitViolation(
    request: AuthenticatedRequest,
    limitType: "tenant" | "user",
    organizationId: string,
    userId: string
  ): Promise<void> {
    const status = this.rateLimiter.getStatus(organizationId, userId);
    const ipAddress = this.extractIpAddress(request);
    const requestId = String(request.id ?? `rate-limit-${Date.now()}`);

    try {
      await this.audit.record({
        organizationId,
        actorUserId: userId,
        requestId,
        action: `rate_limit_exceeded_${limitType}`,
        entityType: "security",
        metadata: {
          endpoint: request.url,
          method: request.method,
          limitType,
          current:
            limitType === "tenant" ? status.tenant.current : status.user.current,
          limit: limitType === "tenant" ? status.tenant.limit : status.user.limit,
          window:
            limitType === "tenant" ? status.tenant.window : status.user.window,
        },
        ipAddress,
      });
    } catch (error) {
      // Fail silently - don't break the response if audit logging fails
      console.error("[TenantRateLimitGuard] Failed to log rate limit violation:", error);
    }
  }

  private extractIpAddress(request: any): string | null {
    const xForwardedFor = request.headers["x-forwarded-for"];
    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor)
        ? xForwardedFor[0]
        : xForwardedFor.split(",")[0];
      return (ips as string).trim() ?? null;
    }

    const xRealIp = request.headers["x-real-ip"];
    if (xRealIp) {
      return Array.isArray(xRealIp) ? xRealIp[0] : (xRealIp as string);
    }

    return request.socket?.remoteAddress ?? null;
  }
}

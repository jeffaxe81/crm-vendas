import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { catchError, Observable } from "rxjs";

import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { AuditService } from "./audit.service";

/**
 * PHASE 3.1: Denied Access Logger
 *
 * Interceptor that captures 401/403 Unauthorized and Forbidden responses
 * and logs them to audit trail for security monitoring.
 *
 * Records:
 * - userId and organizationId from JWT (if available)
 * - endpoint and HTTP method
 * - reason for denial (from error message)
 * - IP address
 * - timestamp
 *
 * Useful for:
 * - Detecting repeated unauthorized access attempts
 * - Identifying potential security incidents
 * - Compliance audit trails
 */
@Injectable()
export class DeniedAccessLogger implements NestInterceptor {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      catchError(error => {
        // Only log 401 and 403 errors
        if (error.status === 401 || error.status === 403) {
          this.logDeniedAccess(request, error).catch(err => {
            // Fail silently - don't break the response if audit logging fails
            console.error("[DeniedAccessLogger] Failed to log denied access:", err);
          });
        }

        throw error;
      })
    );
  }

  private async logDeniedAccess(
    request: AuthenticatedRequest,
    error: any
  ): Promise<void> {
    // Extract information from request
    const userId = request.auth?.userId ?? null;
    const organizationId = request.auth?.organizationId ?? null;
    const endpoint = request.url;
    const method = request.method;
    const ipAddress = this.extractIpAddress(request);
    const reason = error.message ?? "Unknown";

    // Generate request ID if not present
    const requestId = String(request.id ?? `denied-access-${Date.now()}`);

    // Only log if we have either userId or organizationId
    // This ensures we're not logging incomplete information
    if (!userId && !organizationId) {
      return;
    }

    // Log to audit trail
    await this.audit.record({
      organizationId: organizationId ?? "unknown",
      actorUserId: userId,
      requestId,
      action: "access_denied",
      entityType: "security",
      metadata: {
        endpoint,
        method,
        httpStatus: error.status,
        reason,
      },
      ipAddress,
    });
  }

  /**
   * Extract IP address from request
   * Handles: X-Forwarded-For, X-Real-IP, connection.remoteAddress
   */
  private extractIpAddress(request: any): string | null {
    const xForwardedFor = request.headers["x-forwarded-for"];
    if (xForwardedFor) {
      // x-forwarded-for can contain multiple IPs, take the first
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

import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { DeniedAccessLogger } from "../audit/denied-access.logger";
import { TenantRateLimitGuard } from "./tenant-rate-limit.guard";
import { TenantRateLimitService } from "./tenant-rate-limit.service";

/**
 * PHASE 3: Observability Module
 *
 * Provides:
 * 1. DeniedAccessLogger - Interceptor that logs 401/403 attempts
 * 2. TenantRateLimitService - Rate limiting service per tenant/user
 * 3. TenantRateLimitGuard - Global guard enforcing rate limits
 *
 * Usage:
 * - Import in AppModule to enable all features
 */
@Module({
  imports: [AuditModule],
  providers: [
    TenantRateLimitService,
    {
      provide: APP_GUARD,
      useClass: TenantRateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DeniedAccessLogger,
    },
  ],
  exports: [TenantRateLimitService],
})
export class ObservabilityModule {}

import { Injectable, Logger } from "@nestjs/common";

/**
 * PHASE 3.2: Tenant Rate Limit Service
 *
 * In-memory rate limiting implementation with per-tenant and per-user limits.
 *
 * Limits:
 * - 1000 requests/min per tenant (organization)
 * - 50 requests/sec per user
 *
 * NOTE: For production with multiple server instances, upgrade to Redis-based
 * implementation to ensure limits are enforced across all instances.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class TenantRateLimitService {
  private readonly logger = new Logger(TenantRateLimitService.name);

  // Limits (in milliseconds and counts)
  private readonly TENANT_LIMIT = 1000; // req/min
  private readonly TENANT_WINDOW = 60 * 1000; // 1 minute

  private readonly USER_LIMIT = 50; // req/sec
  private readonly USER_WINDOW = 1000; // 1 second

  // Storage: key -> { count, resetAt }
  private readonly tenantLimits = new Map<string, RateLimitEntry>();
  private readonly userLimits = new Map<string, RateLimitEntry>();

  // Cleanup interval (every 5 minutes)
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Check if request is allowed for tenant
   */
  checkTenantLimit(organizationId: string): boolean {
    if (!organizationId) {
      return true; // Allow if no org context
    }

    const now = Date.now();
    const key = organizationId;
    let entry = this.tenantLimits.get(key);

    if (!entry || entry.resetAt <= now) {
      // Reset window
      entry = { count: 0, resetAt: now + this.TENANT_WINDOW };
      this.tenantLimits.set(key, entry);
    }

    entry.count++;

    const allowed = entry.count <= this.TENANT_LIMIT;
    if (!allowed) {
      this.logger.warn(
        `[RATE_LIMIT] Tenant ${organizationId} exceeded limit (${entry.count}/${this.TENANT_LIMIT})`
      );
    }

    return allowed;
  }

  /**
   * Check if request is allowed for user
   */
  checkUserLimit(userId: string, organizationId: string): boolean {
    if (!userId) {
      return true; // Allow if no user context
    }

    const now = Date.now();
    const key = `${organizationId}:${userId}`;
    let entry = this.userLimits.get(key);

    if (!entry || entry.resetAt <= now) {
      // Reset window
      entry = { count: 0, resetAt: now + this.USER_WINDOW };
      this.userLimits.set(key, entry);
    }

    entry.count++;

    const allowed = entry.count <= this.USER_LIMIT;
    if (!allowed) {
      this.logger.warn(
        `[RATE_LIMIT] User ${userId} exceeded limit (${entry.count}/${this.USER_LIMIT})`
      );
    }

    return allowed;
  }

  /**
   * Get current rate limit status (for debugging/monitoring)
   */
  getStatus(organizationId: string, userId: string): {
    tenant: { current: number; limit: number; window: number };
    user: { current: number; limit: number; window: number };
  } {
    const now = Date.now();
    const tenantKey = organizationId;
    const userKey = `${organizationId}:${userId}`;

    const tenantEntry = this.tenantLimits.get(tenantKey);
    const userEntry = this.userLimits.get(userKey);

    return {
      tenant: {
        current: tenantEntry && tenantEntry.resetAt > now ? tenantEntry.count : 0,
        limit: this.TENANT_LIMIT,
        window: this.TENANT_WINDOW,
      },
      user: {
        current: userEntry && userEntry.resetAt > now ? userEntry.count : 0,
        limit: this.USER_LIMIT,
        window: this.USER_WINDOW,
      },
    };
  }

  /**
   * Reset limits for testing
   */
  reset(): void {
    this.tenantLimits.clear();
    this.userLimits.clear();
  }

  /**
   * Cleanup expired entries every 5 minutes
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let tenantCount = 0;
      let userCount = 0;

      for (const [key, entry] of this.tenantLimits.entries()) {
        if (entry.resetAt <= now) {
          this.tenantLimits.delete(key);
          tenantCount++;
        }
      }

      for (const [key, entry] of this.userLimits.entries()) {
        if (entry.resetAt <= now) {
          this.userLimits.delete(key);
          userCount++;
        }
      }

      if (tenantCount > 0 || userCount > 0) {
        this.logger.debug(
          `[RATE_LIMIT_CLEANUP] Cleaned up ${tenantCount} tenant entries and ${userCount} user entries`
        );
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

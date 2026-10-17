import { Inject, Injectable } from "@nestjs/common";

import { PrismaService, assertValidTenantContext } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export const DASHBOARD_VOLUME_WARNING = 800;
export const DASHBOARD_VOLUME_CRITICAL = 1000;

@Injectable()
export class DashboardsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async readVolume(organizationId: string) {
    assertValidTenantContext(organizationId);
    const started = Date.now();
    const counts = await this.prisma.withTenant(
      organizationId,
      async tenant => {
        const where = { organizationId, deletedAt: null };
        const [companies, contacts, opportunities, activities] =
          await Promise.all([
            tenant.company.count({ where }),
            tenant.contact.count({ where }),
            tenant.opportunity.count({ where }),
            tenant.activity.count({ where }),
          ]);
        return { companies, contacts, opportunities, activities };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    const totalActiveRecords =
      counts.companies +
      counts.contacts +
      counts.opportunities +
      counts.activities;

    return {
      asOf: new Date().toISOString(),
      counts,
      totalActiveRecords,
      thresholds: {
        warning: DASHBOARD_VOLUME_WARNING,
        critical: DASHBOARD_VOLUME_CRITICAL,
      },
      level:
        totalActiveRecords >= DASHBOARD_VOLUME_CRITICAL
          ? "critical"
          : totalActiveRecords >= DASHBOARD_VOLUME_WARNING
            ? "warning"
            : "normal",
      queryDurationMs: Date.now() - started,
    };
  }
}

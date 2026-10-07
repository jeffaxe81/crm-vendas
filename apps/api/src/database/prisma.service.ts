import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { parseApiEnvironment } from "../config/environment";
import { Prisma, PrismaClient } from "../generated/prisma/client";

type TenantTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(
    @Optional()
    @Inject("PRISMA_CONNECTION_STRING")
    connectionString?: string
  ) {
    const environment = parseApiEnvironment(process.env);
    const adapter = new PrismaPg({
      connectionString: connectionString ?? environment.APP_DATABASE_URL,
    });

    super({ adapter });
  }

  async withTenant<T>(
    organizationId: string,
    callback: (tenant: Prisma.TransactionClient) => Promise<T>,
    options?: TenantTransactionOptions
  ): Promise<T> {
    return this.$transaction(async tenant => {
      await tenant.$executeRaw`
        SELECT set_config('app.current_organization_id', ${organizationId}, true)
      `;

      return callback(tenant);
    }, options);
  }

  /**
   * Runs a tenant-scoped maintenance transaction under an exclusive advisory
   * lock. Ordinary tenant writes acquire the matching shared lock from
   * database triggers, so writes that started earlier finish first and new
   * writes wait until maintenance commits or rolls back.
   *
   * The bypass flag is transaction-local and only set by this internal API.
   */
  async withMaintenance<T>(
    organizationId: string,
    callback: (tenant: Prisma.TransactionClient) => Promise<T>,
    options?: TenantTransactionOptions
  ): Promise<T> {
    return this.$transaction(async tenant => {
      await tenant.$executeRaw`
        SELECT set_config('app.current_organization_id', ${organizationId}, true)
      `;
      await tenant.$executeRaw`
        SELECT set_config('app.maintenance_authorized', 'on', true)
      `;
      await tenant.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        `tenant-maintenance:${organizationId}`
      );

      return callback(tenant);
    }, options);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

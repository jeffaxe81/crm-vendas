import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { parseApiEnvironment } from "../config/environment";
import { Prisma, PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const environment = parseApiEnvironment(process.env);
    const adapter = new PrismaPg({
      connectionString: environment.DATABASE_URL,
    });

    super({ adapter });
  }

  async withTenant<T>(
    organizationId: string,
    callback: (tenant: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.$transaction(async tenant => {
      await tenant.$executeRaw`
        SELECT set_config('app.current_organization_id', ${organizationId}, true)
      `;

      return callback(tenant);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

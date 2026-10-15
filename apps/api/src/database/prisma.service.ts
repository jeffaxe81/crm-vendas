import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { parseApiEnvironment } from "../config/environment";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { runWithSessionAdvisoryLock } from "./session-advisory-lock";

type TenantTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly lockConnectionString: string;
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
    this.lockConnectionString =
      connectionString ?? environment.APP_DATABASE_URL;
  }

  withSessionAdvisoryLock<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    sharedKey?: string
  ): Promise<T> {
    return runWithSessionAdvisoryLock(
      this.lockConnectionString,
      key,
      operation,
      signal,
      sharedKey
    );
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
   * Waits for tenant writes on a dedicated session before starting the
   * maintenance transaction, so its first snapshot includes their commits.
   * Ordinary writes take the matching shared lock from database triggers.
   *
   * The bypass flag is transaction-local and only set by this internal API.
   */
  async withMaintenance<T>(
    organizationId: string,
    callback: (tenant: Prisma.TransactionClient) => Promise<T>,
    options?: TenantTransactionOptions
  ): Promise<T> {
    // Match Prisma's interactive-transaction defaults and keep the lock wait
    // inside the same timeout budget as the maintenance work.
    const timeout = options?.timeout ?? 5_000;
    const maxWait = options?.maxWait ?? 2_000;
    if (
      !Number.isSafeInteger(timeout) ||
      timeout <= 0 ||
      timeout > 2_147_483_647 ||
      !Number.isSafeInteger(maxWait) ||
      maxWait <= 0
    ) {
      throw new Error("INVALID_MAINTENANCE_TIMEOUT");
    }
    const maintenance = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: this.lockConnectionString,
        max: 1,
        idleTimeoutMillis: 0,
        connectionTimeoutMillis: maxWait,
        lock_timeout: timeout,
      }),
    });
    const startedAt = Date.now();
    try {
      // This autocommit statement waits outside the RepeatableRead snapshot.
      // The private one-connection pool retains its session lock across BEGIN.
      const [locked] = await maintenance.$queryRawUnsafe<{ pid: number }[]>(
        "SELECT pg_backend_pid() AS pid FROM pg_advisory_lock(hashtextextended($1,0))",
        `tenant-maintenance:${organizationId}`
      );
      const remaining = timeout - (Date.now() - startedAt);
      if (remaining <= 0) throw new Error("MAINTENANCE_TIMEOUT");

      return await maintenance.$transaction(
        async tenant => {
          const [backend] = await tenant.$queryRawUnsafe<{ pid: number }[]>(
            "SELECT pg_backend_pid() AS pid"
          );
          // A replacement connection cannot inherit the session lock. Never
          // invoke maintenance on it or reacquire the lock after its snapshot.
          if (!locked || backend?.pid !== locked.pid) {
            throw new Error("MAINTENANCE_CONNECTION_CHANGED");
          }
          await tenant.$executeRaw`
            SELECT set_config('app.current_organization_id', ${organizationId}, true)
          `;
          await tenant.$executeRaw`
            SELECT set_config('app.maintenance_authorized', 'on', true)
          `;

          return callback(tenant);
        },
        { ...options, timeout: remaining }
      );
    } finally {
      // Session locks survive rollback: closing this exact private pool releases
      // the lock after both success and failure, including acquisition errors.
      await maintenance.$disconnect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

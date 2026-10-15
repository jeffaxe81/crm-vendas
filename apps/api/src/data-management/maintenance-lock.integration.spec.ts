import { PrismaService } from "../database/prisma.service";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settlesWithin(
  promise: Promise<unknown>,
  milliseconds = 100
): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>(resolve =>
      setTimeout(() => resolve(false), milliseconds)
    ),
  ]);
}

describe("tenant maintenance write lock", () => {
  let owner: PrismaService;
  let writer: PrismaService;
  let maintenance: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    writer = new PrismaService(process.env.RLS_DATABASE_URL);
    maintenance = new PrismaService(process.env.RLS_DATABASE_URL);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const user = await owner.user.create({
      data: {
        email: "maintenance@example.test",
        emailNormalized: "maintenance@example.test",
        displayName: "Maintenance",
        passwordHash: "synthetic",
      },
    });
    userId = user.id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Maintenance A", slug: "maintenance-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Maintenance B", slug: "maintenance-b" },
      })
    ).id;
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await writer?.onModuleDestroy();
    await maintenance?.onModuleDestroy();
  });

  it("waits for an earlier write and blocks new writes only for that organization", async () => {
    const firstInserted = deferred();
    const releaseFirst = deferred();

    const firstWrite = writer.withTenant(organizationId, async tx => {
      await tx.company.create({
        data: {
          organizationId,
          legalName: "Before maintenance",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      firstInserted.resolve();
      await releaseFirst.promise;
    });
    await firstInserted.promise;

    const maintenanceAcquired = deferred();
    const releaseMaintenance = deferred();
    const maintenanceWork = maintenance.withMaintenance(
      organizationId,
      async tx => {
        maintenanceAcquired.resolve();
        await releaseMaintenance.promise;
        await tx.company.updateMany({
          where: { organizationId },
          data: { notes: "maintained" },
        });
      }
    );

    expect(await settlesWithin(maintenanceAcquired.promise)).toBe(false);

    releaseFirst.resolve();
    await firstWrite;
    await maintenanceAcquired.promise;

    const secondInserted = deferred();
    const secondWrite = writer.withTenant(organizationId, async tx => {
      await tx.company.create({
        data: {
          organizationId,
          legalName: "After maintenance",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      secondInserted.resolve();
    });

    expect(await settlesWithin(secondInserted.promise)).toBe(false);

    await writer.withTenant(otherOrganizationId, tx =>
      tx.company.create({
        data: {
          organizationId: otherOrganizationId,
          legalName: "Other tenant remains writable",
          createdBy: userId,
          updatedBy: userId,
        },
      })
    );

    releaseMaintenance.resolve();
    await maintenanceWork;
    await secondWrite;
    expect(await settlesWithin(secondInserted.promise)).toBe(true);

    const names = await writer.withTenant(organizationId, tx =>
      tx.company.findMany({
        orderBy: { legalName: "asc" },
        select: { legalName: true, notes: true },
      })
    );
    expect(names).toEqual([
      { legalName: "After maintenance", notes: null },
      { legalName: "Before maintenance", notes: "maintained" },
    ]);
  });

  it.each(["insert", "update"] as const)(
    "includes an earlier committed %s in the first locked RepeatableRead snapshot",
    async mutation => {
      const existing = await owner.company.create({
        data: {
          organizationId,
          legalName: "Original company",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      const written = deferred();
      const releaseWriter = deferred();
      let writerPid = 0;
      const firstWrite = writer.withTenant(organizationId, async tx => {
        const [backend] = await tx.$queryRawUnsafe<{ pid: number }[]>(
          "SELECT pg_backend_pid() AS pid"
        );
        writerPid = backend!.pid;
        if (mutation === "insert") {
          await tx.company.create({
            data: {
              organizationId,
              legalName: "Committed before maintenance",
              createdBy: userId,
              updatedBy: userId,
            },
          });
        } else {
          await tx.company.update({
            where: { id: existing.id },
            data: { legalName: "Committed before maintenance" },
          });
        }
        written.resolve();
        await releaseWriter.promise;
      });
      await written.promise;

      const firstSnapshot = maintenance.withMaintenance(
        organizationId,
        tx =>
          tx.company.findMany({
            where: { organizationId },
            orderBy: { legalName: "asc" },
            select: { legalName: true },
          }),
        { isolationLevel: "RepeatableRead", timeout: 10_000 }
      );
      try {
        // Observe the real advisory-lock wait before allowing the prior writer
        // to commit. Both the old xact lock and the fixed session lock use it.
        const deadline = Date.now() + 5_000;
        let waiting = false;
        while (Date.now() < deadline) {
          const blocked = await owner.$queryRawUnsafe<{ pid: number }[]>(
            `SELECT pid FROM pg_stat_activity
             WHERE wait_event_type='Lock' AND wait_event='advisory'
               AND $1::int=ANY(pg_blocking_pids(pid))`,
            writerPid
          );
          if (blocked.length > 0) {
            waiting = true;
            break;
          }
          await new Promise<void>(resolve => setImmediate(resolve));
        }
        expect(waiting).toBe(true);
        releaseWriter.resolve();
        await firstWrite;
        expect(await firstSnapshot).toEqual(
          mutation === "insert"
            ? [
                { legalName: "Committed before maintenance" },
                { legalName: "Original company" },
              ]
            : [{ legalName: "Committed before maintenance" }]
        );
      } finally {
        releaseWriter.resolve();
        await Promise.allSettled([firstWrite, firstSnapshot]);
      }
    }
  );

  it("installs a maintenance guard on the organization root and every current tenant table", async () => {
    const missing = await owner.$queryRawUnsafe<{ table_name: string }[]>(`
      SELECT tables.table_name::text
      FROM (
        SELECT 'organizations'::text AS table_name
        UNION
        SELECT DISTINCT column_name.table_name::text
        FROM information_schema.columns column_name
        JOIN information_schema.tables base_table
          ON base_table.table_schema = column_name.table_schema
         AND base_table.table_name = column_name.table_name
        WHERE column_name.table_schema = 'public'
          AND column_name.column_name = 'organization_id'
          AND base_table.table_type = 'BASE TABLE'
      ) tables
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger
        JOIN pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = tables.table_name
          AND trigger.tgname = 'crm_tenant_maintenance_guard'
          AND NOT trigger.tgisinternal
      )
      ORDER BY tables.table_name
    `);

    expect(missing).toEqual([]);
  });

  it("scopes the internal maintenance bypass to the locked organization", async () => {
    await expect(
      maintenance.withMaintenance(organizationId, tx =>
        tx.$executeRawUnsafe(
          "UPDATE public.organizations SET name='Escaped' WHERE id=$1::uuid",
          otherOrganizationId
        )
      )
    ).rejects.toThrow();

    expect(
      (
        await owner.organization.findUniqueOrThrow({
          where: { id: otherOrganizationId },
          select: { name: true },
        })
      ).name
    ).toBe("Maintenance B");
  });

  it("allows the internal maintenance transaction to write while holding the exclusive lock", async () => {
    await maintenance.withMaintenance(organizationId, tx =>
      tx.company.create({
        data: {
          organizationId,
          legalName: "Internal maintenance write",
          createdBy: userId,
          updatedBy: userId,
        },
      })
    );

    expect(
      await writer.withTenant(organizationId, tx => tx.company.count())
    ).toBe(1);
  });
});

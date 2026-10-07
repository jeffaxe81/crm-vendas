import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";

describe("backup control tables under restricted tenant RLS", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    const [role] = await runtime.$queryRawUnsafe<
      { rolbypassrls: boolean; rolsuper: boolean }[]
    >(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user"
    );
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
  });
  async function reset() {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
  }
  beforeEach(async () => {
    await reset();
    organizationId = (
      await owner.organization.create({
        data: { name: "Catalog A", slug: "catalog-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Catalog B", slug: "catalog-b" },
      })
    ).id;
  });
  afterAll(async () => {
    if (owner) {
      await reset();
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
  });
  it("isolates backups, operations and schedules from other tenants and empty context", async () => {
    const id = randomUUID();
    await runtime.withTenant(organizationId, async tx => {
      await tx.$executeRawUnsafe(
        "INSERT INTO public.backups (id, organization_id, reason) VALUES ($1::uuid,$2::uuid,'MANUAL')",
        id,
        organizationId
      );
      await tx.$executeRawUnsafe(
        "INSERT INTO public.data_operations (id,organization_id,kind) VALUES ($1::uuid,$2::uuid,'BACKUP')",
        randomUUID(),
        organizationId
      );
      await tx.$executeRawUnsafe(
        "INSERT INTO public.backup_schedules (organization_id) VALUES ($1::uuid)",
        organizationId
      );
      for (const table of ["backups", "data_operations", "backup_schedules"])
        expect(
          await tx.$queryRawUnsafe(
            `SELECT organization_id FROM public.${table}`
          )
        ).toEqual([{ organization_id: organizationId }]);
    });
    for (const table of ["backups", "data_operations", "backup_schedules"]) {
      expect(
        await runtime.$queryRawUnsafe(
          `SELECT organization_id FROM public.${table}`
        )
      ).toEqual([]);
      expect(
        await runtime.withTenant(otherOrganizationId, tx =>
          tx.$queryRawUnsafe(`SELECT organization_id FROM public.${table}`)
        )
      ).toEqual([]);
    }
    await expect(
      runtime.withTenant(otherOrganizationId, tx =>
        tx.$executeRawUnsafe(
          "INSERT INTO public.backups (id,organization_id,reason) VALUES ($1::uuid,$2::uuid,'MANUAL')",
          randomUUID(),
          organizationId
        )
      )
    ).rejects.toThrow();
  });
  it("cannot label a catalog row completed without verified metadata", async () => {
    const id = randomUUID();
    await runtime.withTenant(organizationId, tx =>
      tx.$executeRawUnsafe(
        "INSERT INTO public.backups (id,organization_id,reason) VALUES ($1::uuid,$2::uuid,'MANUAL')",
        id,
        organizationId
      )
    );
    await expect(
      runtime.withTenant(organizationId, tx =>
        tx.$executeRawUnsafe(
          "UPDATE public.backups SET state='COMPLETED', completed_at=now() WHERE id=$1::uuid",
          id
        )
      )
    ).rejects.toThrow();
    const rows = await runtime.withTenant(organizationId, tx =>
      tx.$queryRawUnsafe(
        "SELECT state FROM public.backups WHERE id=$1::uuid",
        id
      )
    );
    expect(rows).toEqual([{ state: "PENDING" }]);
  });
  it("rejects preventive backups belonging to another organization", async () => {
    const backupId = randomUUID();
    await runtime.withTenant(organizationId, tx =>
      tx.$executeRawUnsafe(
        "INSERT INTO public.backups (id,organization_id,reason) VALUES ($1::uuid,$2::uuid,'PRE_RESTORE')",
        backupId,
        organizationId
      )
    );
    await expect(
      runtime.withTenant(otherOrganizationId, tx =>
        tx.$executeRawUnsafe(
          "INSERT INTO public.data_operations (id,organization_id,kind,preventive_backup_id) VALUES ($1::uuid,$2::uuid,'RESTORE',$3::uuid)",
          randomUUID(),
          otherOrganizationId,
          backupId
        )
      )
    ).rejects.toThrow();
  });
  it("rejects unsupported schedule retention, timezone and invalid intervals", async () => {
    await runtime.withTenant(organizationId, tx =>
      tx.$executeRawUnsafe(
        "INSERT INTO public.backup_schedules (organization_id) VALUES ($1::uuid)",
        organizationId
      )
    );
    for (const sql of [
      "retention_count=8",
      "timezone='UTC'",
      "frequency='INTERVAL', interval_minutes=NULL",
      "frequency='INTERVAL', interval_minutes=0",
      "local_time='25:00'",
    ]) {
      await expect(
        runtime.withTenant(organizationId, tx =>
          tx.$executeRawUnsafe(`UPDATE public.backup_schedules SET ${sql}`)
        )
      ).rejects.toThrow();
    }
  });
});

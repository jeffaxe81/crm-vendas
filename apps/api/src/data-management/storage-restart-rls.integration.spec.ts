import { randomUUID } from "node:crypto";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { TenantStorageAllocationService } from "./tenant-storage-allocation.service";

describe("storage restart, RLS and rollback drill", () => {
  let owner: PrismaService;
  let restricted: PrismaService;
  let orgA: string;
  let orgB: string;
  let userId: string;

  const principal = (organizationId: string) =>
    ({
      organizationId,
      userId,
      authMethod: "session",
      isSuperuser: true,
    }) as AuthenticatedPrincipal;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const user = await owner.user.create({
      data: {
        email: "restart-" + randomUUID() + "@example.test",
        emailNormalized: "restart-" + randomUUID() + "@example.test",
        displayName: "Restart Drill",
        passwordHash: "synthetic",
      },
    });
    userId = user.id;
    orgA = (
      await owner.organization.create({
        data: { name: "Restart A", slug: "restart-a" },
      })
    ).id;
    orgB = (
      await owner.organization.create({
        data: { name: "Restart B", slug: "restart-b" },
      })
    ).id;
  });

  afterAll(async () => {
    await restricted?.onModuleDestroy();
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
  });

  it("persists allocation after reconnect, preserves RLS and rolls back failure", async () => {
    let service = new TenantStorageAllocationService(restricted);
    await service.configure(
      principal(orgA),
      {
        allocatedGiB: 8,
        enforced: true,
        confirmation: "AJUSTAR COTA",
      },
      randomUUID()
    );

    await restricted.onModuleDestroy();
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);
    service = new TenantStorageAllocationService(restricted);

    expect(await service.read(principal(orgA))).toMatchObject({
      allocatedGiB: 8,
      enforced: true,
    });

    const crossTenant = await restricted.withTenant(orgB, tx =>
      tx.$queryRawUnsafe(
        'SELECT organization_id FROM public.tenant_storage_allocations WHERE organization_id=$1::uuid',
        orgA
      )
    );
    expect(crossTenant).toEqual([]);

    await expect(
      restricted.withTenant(orgA, async tx => {
        await tx.$executeRawUnsafe(
          'UPDATE public.tenant_storage_allocations SET allocation_gib=99 WHERE organization_id=$1::uuid',
          orgA
        );
        throw new Error("SYNTHETIC_ROLLBACK");
      })
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");

    expect(await service.read(principal(orgA))).toMatchObject({
      allocatedGiB: 8,
      enforced: true,
    });
  });
});

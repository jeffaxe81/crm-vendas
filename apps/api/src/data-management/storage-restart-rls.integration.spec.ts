import { randomUUID } from "node:crypto";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { storageDrillConnections } from "./storage-drill-safety";
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
    const connections = storageDrillConnections(process.env);
    owner = new PrismaService(connections.owner);
    restricted = new PrismaService(connections.restricted);
    const [role] = await restricted.$queryRawUnsafe<
      {
        rolsuper: boolean;
        rolbypassrls: boolean;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(`SELECT r.rolsuper, r.rolbypassrls, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_roles r CROSS JOIN pg_class c
       WHERE r.rolname = current_user
         AND c.oid = 'public.tenant_storage_allocations'::regclass`);
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
  });

  beforeEach(async () => {
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
        data: { name: "Restart A", slug: "restart-a-" + randomUUID() },
      })
    ).id;
    orgB = (
      await owner.organization.create({
        data: { name: "Restart B", slug: "restart-b-" + randomUUID() },
      })
    ).id;
  });

  afterAll(async () => {
    // Audit rows are immutable. Retain uniquely named synthetic fixtures rather
    // than truncating unrelated tenants or bypassing audit protections.
    try {
      await restricted?.onModuleDestroy();
    } finally {
      await owner?.onModuleDestroy();
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
        "SELECT organization_id FROM public.tenant_storage_allocations WHERE organization_id=$1::uuid",
        orgA
      )
    );
    expect(crossTenant).toEqual([]);

    await expect(
      restricted.withTenant(orgA, async tx => {
        const changed = await tx.$executeRawUnsafe(
          "UPDATE public.tenant_storage_allocations SET allocation_gib=99 WHERE organization_id=$1::uuid",
          orgA
        );
        expect(changed).toBe(1);
        throw new Error("SYNTHETIC_ROLLBACK");
      })
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");

    expect(await service.read(principal(orgA))).toMatchObject({
      allocatedGiB: 8,
      enforced: true,
    });
  });
});

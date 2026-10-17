import { randomUUID } from "node:crypto";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { TenantStorageAllocationService } from "./tenant-storage-allocation.service";

describe("tenant backup allocation and RLS", () => {
  let owner: PrismaService;
  let restricted: PrismaService;
  let service: TenantStorageAllocationService;
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
    service = new TenantStorageAllocationService(restricted);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const user = await owner.user.create({
      data: {
        email: "storage-" + randomUUID() + "@example.test",
        emailNormalized: "storage-" + randomUUID() + "@example.test",
        displayName: "Storage Owner",
        passwordHash: "synthetic",
      },
    });
    userId = user.id;
    orgA = (
      await owner.organization.create({
        data: { name: "Storage A", slug: "storage-a" },
      })
    ).id;
    orgB = (
      await owner.organization.create({
        data: { name: "Storage B", slug: "storage-b" },
      })
    ).id;
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
      await owner.onModuleDestroy();
    }
    await restricted?.onModuleDestroy();
  });

  it("is unset by default and only changes with a confirmed tenant update", async () => {
    expect(await service.read(principal(orgA))).toMatchObject({
      allocatedGiB: null,
      usedBytes: "0",
      backupCount: 0,
      alertLevel: "UNALLOCATED",
      enforced: false,
    });
    await expect(
      service.configure(principal(orgA), { allocatedGiB: 5 }, randomUUID())
    ).rejects.toThrow();
    await expect(
      service.configure(
        principal(orgA),
        { allocatedGiB: 0, confirmation: "AJUSTAR COTA" },
        randomUUID()
      )
    ).rejects.toThrow();
    const configured = await service.configure(
      principal(orgA),
      { allocatedGiB: 5, confirmation: "AJUSTAR COTA" },
      randomUUID()
    );
    expect(configured).toMatchObject({
      allocatedGiB: 5,
      alertLevel: "OK",
    });
    expect((await service.read(principal(orgB))).allocatedGiB).toBeNull();
    const foreignRows = await restricted.withTenant(orgB, tx =>
      tx.$queryRaw<{ organization_id: string }[]>`
        SELECT organization_id
        FROM public.tenant_storage_allocations
        WHERE organization_id = ${orgA}::uuid
      `
    );
    expect(foreignRows).toEqual([]);
    const audit = await restricted.withTenant(orgA, tx =>
      tx.auditLog.findFirst({
        where: { action: "storage.allocation_changed" },
      })
    );
    expect(audit?.metadata).toMatchObject({
      previousGiB: null,
      allocatedGiB: 5,
      enforced: false,
    });
  });

  it("measures only this tenant's completed/deleting catalog bytes and alerts", async () => {
    const gib = 1024n * 1024n * 1024n;
    await owner.backupRecord.createMany({
      data: [
        {
          organizationId: orgA,
          reason: "MANUAL",
          state: "COMPLETED",
          byteCount: 9n * gib,
        },
        {
          organizationId: orgA,
          reason: "MANUAL",
          state: "DELETING",
          byteCount: 1n * gib,
        },
        {
          organizationId: orgA,
          reason: "MANUAL",
          state: "FAILED",
          byteCount: 100n * gib,
        },
        {
          organizationId: orgB,
          reason: "MANUAL",
          state: "COMPLETED",
          byteCount: 500n * gib,
        },
      ],
    });
    await service.configure(
      principal(orgA),
      { allocatedGiB: 12, confirmation: "AJUSTAR COTA" },
      randomUUID()
    );
    expect(await service.read(principal(orgA))).toMatchObject({
      usedBytes: (10n * gib).toString(),
      backupCount: 2,
      usagePercent: 83,
      alertLevel: "WARNING",
    });
    await service.configure(
      principal(orgA),
      { allocatedGiB: 9, confirmation: "AJUSTAR COTA" },
      randomUUID()
    );
    expect((await service.read(principal(orgA))).alertLevel).toBe("EXCEEDED");
    await service.configure(
      principal(orgA),
      { allocatedGiB: null, confirmation: "AJUSTAR COTA" },
      randomUUID()
    );
    expect((await service.read(principal(orgA))).alertLevel).toBe("UNALLOCATED");
  });
});

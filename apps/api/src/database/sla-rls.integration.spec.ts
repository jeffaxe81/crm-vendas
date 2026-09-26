import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

describe("C5.3 SLA policy tenant RLS integration", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  const organizationA = "c5300000-0000-4000-8000-000000000001";
  const organizationB = "c5300000-0000-4000-8000-000000000002";
  const userA = "c5310000-0000-4000-8000-000000000001";
  const userB = "c5310000-0000-4000-8000-000000000002";

  beforeAll(async () => {
    prisma = new PrismaService(process.env.RLS_DATABASE_URL);
    admin = new PrismaClient({
      adapter: new PrismaPg({
        connectionString:
          process.env.MIGRATION_DATABASE_URL ??
          "postgresql://axes:axes@localhost:5432/axes_crm",
      }),
    });

    await admin.organization.createMany({
      data: [
        { id: organizationA, name: "SLA RLS A", slug: "sla-rls-a" },
        { id: organizationB, name: "SLA RLS B", slug: "sla-rls-b" },
      ],
    });
    await admin.user.createMany({
      data: [userA, userB].map((id, index) => ({
        id,
        email: `sla-rls-${index}@example.test`,
        emailNormalized: `sla-rls-${index}@example.test`,
        displayName: `SLA RLS ${index}`,
        passwordHash: "not-used-by-this-test",
      })),
    });
    await admin.slaPolicy.createMany({
      data: [
        {
          organizationId: organizationA,
          priority: "HIGH",
          firstResponseMinutes: 30,
          resolutionMinutes: 240,
          createdBy: userA,
          updatedBy: userA,
        },
        {
          organizationId: organizationB,
          priority: "HIGH",
          firstResponseMinutes: 60,
          resolutionMinutes: 480,
          createdBy: userB,
          updatedBy: userB,
        },
      ],
    });
  });

  afterAll(async () => {
    await admin.slaPolicy.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await admin.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await admin.organization.deleteMany({
      where: { id: { in: [organizationA, organizationB] } },
    });
    await prisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it("fails closed without tenant context and isolates policies", async () => {
    await expect(prisma.slaPolicy.findMany()).resolves.toEqual([]);

    const tenantA = await prisma.withTenant(organizationA, tenant =>
      tenant.slaPolicy.findMany()
    );
    expect(tenantA.map(policy => policy.firstResponseMinutes)).toEqual([30]);

    const updatedFromA = await prisma.withTenant(organizationA, tenant =>
      tenant.slaPolicy.updateMany({
        where: { organizationId: organizationB },
        data: { firstResponseMinutes: 1 },
      })
    );
    expect(updatedFromA.count).toBe(0);
  });

  it("rejects writes for another organization and enforces checks", async () => {
    await expect(
      prisma.withTenant(organizationA, tenant =>
        tenant.slaPolicy.create({
          data: {
            organizationId: organizationB,
            priority: "LOW",
            firstResponseMinutes: 30,
            resolutionMinutes: 60,
            createdBy: userA,
            updatedBy: userA,
          },
        })
      )
    ).rejects.toThrow();

    await expect(
      prisma.withTenant(organizationA, tenant =>
        tenant.slaPolicy.create({
          data: {
            organizationId: organizationA,
            priority: "LOW",
            firstResponseMinutes: 60,
            resolutionMinutes: 30,
            createdBy: userA,
            updatedBy: userA,
          },
        })
      )
    ).rejects.toThrow();

    await expect(
      prisma.withTenant(organizationA, tenant =>
        tenant.slaPolicy.create({
          data: {
            organizationId: organizationA,
            priority: "HIGH",
            firstResponseMinutes: 10,
            resolutionMinutes: 20,
            createdBy: userA,
            updatedBy: userA,
          },
        })
      )
    ).rejects.toThrow();
  });
});

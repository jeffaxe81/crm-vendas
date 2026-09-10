import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

describe("Activity tenant RLS integration", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes_app:axes_app@localhost:5432/axes_crm";

    prisma = new PrismaService();
    admin = new PrismaClient({
      adapter: new PrismaPg({
        connectionString:
          process.env.MIGRATION_DATABASE_URL ??
          "postgresql://axes:axes@localhost:5432/axes_crm",
      }),
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it("fails closed without tenant context and isolates activities across tenants", async () => {
    const organizationA = "81000000-0000-4000-8000-000000000001";
    const organizationB = "81000000-0000-4000-8000-000000000002";
    const userA = "82000000-0000-4000-8000-000000000001";
    const userB = "82000000-0000-4000-8000-000000000002";
    const activityA = "83000000-0000-4000-8000-000000000001";
    const activityB = "83000000-0000-4000-8000-000000000002";

    await admin.organization.createMany({
      data: [
        {
          id: organizationA,
          name: "Activity RLS Organization A",
          slug: "activity-rls-organization-a",
        },
        {
          id: organizationB,
          name: "Activity RLS Organization B",
          slug: "activity-rls-organization-b",
        },
      ],
    });

    await admin.user.createMany({
      data: [
        {
          id: userA,
          email: "activity-rls-a@example.test",
          emailNormalized: "activity-rls-a@example.test",
          displayName: "Activity RLS User A",
          passwordHash: "not-used-by-this-test",
        },
        {
          id: userB,
          email: "activity-rls-b@example.test",
          emailNormalized: "activity-rls-b@example.test",
          displayName: "Activity RLS User B",
          passwordHash: "not-used-by-this-test",
        },
      ],
    });

    await admin.activity.createMany({
      data: [
        {
          id: activityA,
          organizationId: organizationA,
          type: "TASK",
          priority: "HIGH",
          title: "Follow-up tenant A",
          ownerUserId: userA,
          createdBy: userA,
          updatedBy: userA,
        },
        {
          id: activityB,
          organizationId: organizationB,
          type: "APPOINTMENT",
          title: "Meeting tenant B",
          ownerUserId: userB,
          createdBy: userB,
          updatedBy: userB,
        },
      ],
    });

    await expect(prisma.activity.findMany()).resolves.toEqual([]);

    const tenantA = await prisma.withTenant(organizationA, tenant =>
      tenant.activity.findMany({ orderBy: { title: "asc" } })
    );
    expect(tenantA).toHaveLength(1);
    expect(tenantA[0]?.id).toBe(activityA);

    const tenantB = await prisma.withTenant(organizationB, tenant =>
      tenant.activity.findMany({ orderBy: { title: "asc" } })
    );
    expect(tenantB).toHaveLength(1);
    expect(tenantB[0]?.id).toBe(activityB);
  });

  it("rejects writes whose organization differs from the transaction tenant", async () => {
    const organizationA = "81000000-0000-4000-8000-000000000003";
    const organizationB = "81000000-0000-4000-8000-000000000004";
    const userB = "82000000-0000-4000-8000-000000000004";

    await admin.organization.createMany({
      data: [
        {
          id: organizationA,
          name: "Activity RLS Write Organization A",
          slug: "activity-rls-write-organization-a",
        },
        {
          id: organizationB,
          name: "Activity RLS Write Organization B",
          slug: "activity-rls-write-organization-b",
        },
      ],
    });
    await admin.user.create({
      data: {
        id: userB,
        email: "activity-rls-write-b@example.test",
        emailNormalized: "activity-rls-write-b@example.test",
        displayName: "Activity RLS Write User B",
        passwordHash: "not-used-by-this-test",
      },
    });

    await expect(
      prisma.withTenant(organizationA, tenant =>
        tenant.activity.create({
          data: {
            organizationId: organizationB,
            type: "TASK",
            title: "Cross-tenant activity",
            ownerUserId: userB,
            createdBy: userB,
            updatedBy: userB,
          },
        })
      )
    ).rejects.toThrow();
  });
});

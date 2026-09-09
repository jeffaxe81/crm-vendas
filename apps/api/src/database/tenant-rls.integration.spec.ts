import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

type CurrentRole = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

describe("Tenant RLS integration", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes:axes@localhost:5432/axes_crm";

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

  it("uses an application role that cannot bypass row-level security", async () => {
    const roles = await prisma.$queryRaw<CurrentRole[]>`
      SELECT rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `;

    expect(roles).toHaveLength(1);

    const role = roles[0];
    if (!role) {
      throw new Error("PostgreSQL current_user role was not found");
    }

    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  it("fails closed for tenant-owned companies when tenant context is missing", async () => {
    const context = await prisma.$queryRaw<
      Array<{ organizationId: string | null }>
    >`
      SELECT nullif(current_setting('app.current_organization_id', true), '') AS "organizationId"
    `;

    expect(context).toEqual([{ organizationId: null }]);

    const organizationId = "10000000-0000-4000-8000-000000000001";
    const userId = "20000000-0000-4000-8000-000000000001";
    const companyId = "30000000-0000-4000-8000-000000000001";

    await admin.organization.create({
      data: {
        id: organizationId,
        name: "RLS Characterization Organization",
        slug: "rls-characterization-organization",
      },
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "rls-characterization@example.test",
        emailNormalized: "rls-characterization@example.test",
        displayName: "RLS Characterization User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.company.create({
      data: {
        id: companyId,
        organizationId,
        legalName: "Company visible without RLS",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await expect(
      prisma.company.findMany({ where: { id: companyId } })
    ).resolves.toEqual([]);
  });

  it("exposes tenant-owned companies only inside a transaction-scoped tenant context", async () => {
    const organizationId = "10000000-0000-4000-8000-000000000002";
    const userId = "20000000-0000-4000-8000-000000000002";
    const companyId = "30000000-0000-4000-8000-000000000002";

    await admin.organization.create({
      data: {
        id: organizationId,
        name: "RLS Tenant Context Organization",
        slug: "rls-tenant-context-organization",
      },
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "rls-tenant-context@example.test",
        emailNormalized: "rls-tenant-context@example.test",
        displayName: "RLS Tenant Context User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.company.create({
      data: {
        id: companyId,
        organizationId,
        legalName: "Company visible with tenant context",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    const companies = await prisma.withTenant(organizationId, tenant =>
      tenant.company.findMany({ where: { id: companyId } })
    );

    expect(companies).toHaveLength(1);
    expect(companies[0]?.id).toBe(companyId);

    await expect(
      prisma.company.findMany({ where: { id: companyId } })
    ).resolves.toEqual([]);
  });
});

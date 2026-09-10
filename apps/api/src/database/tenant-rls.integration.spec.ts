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

  it("fails closed for tenant-owned contacts when tenant context is missing", async () => {
    const organizationId = "10000000-0000-4000-8000-000000000003";
    const userId = "20000000-0000-4000-8000-000000000003";
    const contactId = "40000000-0000-4000-8000-000000000003";

    await admin.organization.create({
      data: {
        id: organizationId,
        name: "RLS Contact Characterization Organization",
        slug: "rls-contact-characterization-organization",
      },
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "rls-contact-characterization@example.test",
        emailNormalized: "rls-contact-characterization@example.test",
        displayName: "RLS Contact Characterization User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.contact.create({
      data: {
        id: contactId,
        organizationId,
        fullName: "Contact visible without RLS",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await expect(
      prisma.contact.findMany({ where: { id: contactId } })
    ).resolves.toEqual([]);
  });

  it("fails closed for tenant-owned contact channels when tenant context is missing", async () => {
    const organizationId = "10000000-0000-4000-8000-000000000004";
    const userId = "20000000-0000-4000-8000-000000000004";
    const contactId = "40000000-0000-4000-8000-000000000004";
    const channelId = "50000000-0000-4000-8000-000000000004";

    await admin.organization.create({
      data: {
        id: organizationId,
        name: "RLS Contact Channel Characterization Organization",
        slug: "rls-contact-channel-characterization-organization",
      },
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "rls-contact-channel-characterization@example.test",
        emailNormalized: "rls-contact-channel-characterization@example.test",
        displayName: "RLS Contact Channel Characterization User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.contact.create({
      data: {
        id: contactId,
        organizationId,
        fullName: "Contact channel parent",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await admin.contactChannel.create({
      data: {
        id: channelId,
        organizationId,
        contactId,
        type: "EMAIL",
        value: "visible-without-channel-rls@example.test",
        isPrimary: true,
      },
    });

    await expect(
      prisma.contactChannel.findMany({ where: { id: channelId } })
    ).resolves.toEqual([]);
  });

  it("fails closed and isolates tenant-owned pipelines and stages", async () => {
    const organizationId = "10000000-0000-4000-8000-000000000005";
    const otherOrganizationId = "10000000-0000-4000-8000-000000000006";
    const pipelineId = "60000000-0000-4000-8000-000000000005";
    const stageId = "70000000-0000-4000-8000-000000000005";

    await admin.organization.createMany({
      data: [
        {
          id: organizationId,
          name: "RLS Pipeline Organization",
          slug: "rls-pipeline-organization",
        },
        {
          id: otherOrganizationId,
          name: "RLS Other Pipeline Organization",
          slug: "rls-other-pipeline-organization",
        },
      ],
    });
    await admin.pipeline.create({
      data: {
        id: pipelineId,
        organizationId,
        name: "RLS Pipeline",
        normalizedName: "rls pipeline",
      },
    });
    await admin.pipelineStage.create({
      data: {
        id: stageId,
        organizationId,
        pipelineId,
        name: "Prospecção",
        position: 1,
        kind: "OPEN",
      },
    });

    await expect(
      prisma.pipeline.findMany({ where: { id: pipelineId } })
    ).resolves.toEqual([]);
    await expect(
      prisma.pipelineStage.findMany({ where: { id: stageId } })
    ).resolves.toEqual([]);

    const visible = await prisma.withTenant(organizationId, async tenant =>
      Promise.all([
        tenant.pipeline.findMany({ where: { id: pipelineId } }),
        tenant.pipelineStage.findMany({ where: { id: stageId } }),
      ])
    );

    expect(visible[0]).toHaveLength(1);
    expect(visible[1]).toHaveLength(1);

    const crossTenant = await prisma.withTenant(
      otherOrganizationId,
      async tenant =>
        Promise.all([
          tenant.pipeline.findMany({ where: { id: pipelineId } }),
          tenant.pipelineStage.findMany({ where: { id: stageId } }),
        ])
    );

    expect(crossTenant).toEqual([[], []]);
  });
});

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

const ids = {
  organizationA: "91000000-0000-4000-8000-000000000001",
  organizationB: "91000000-0000-4000-8000-000000000002",
  userA: "92000000-0000-4000-8000-000000000001",
  userB: "92000000-0000-4000-8000-000000000002",
  membershipA: "92500000-0000-4000-8000-000000000001",
  membershipB: "92500000-0000-4000-8000-000000000002",
  companyA: "93000000-0000-4000-8000-000000000001",
  companyB: "93000000-0000-4000-8000-000000000002",
  contactA: "94000000-0000-4000-8000-000000000001",
  contactB: "94000000-0000-4000-8000-000000000002",
  pipelineA: "95000000-0000-4000-8000-000000000001",
  pipelineB: "95000000-0000-4000-8000-000000000002",
  pipelineASecondary: "95000000-0000-4000-8000-000000000003",
  stageA: "96000000-0000-4000-8000-000000000001",
  stageB: "96000000-0000-4000-8000-000000000002",
  stageASecondary: "96000000-0000-4000-8000-000000000003",
  opportunityACompany: "97000000-0000-4000-8000-000000000001",
  opportunityBContact: "97000000-0000-4000-8000-000000000002",
  opportunityAContact: "97000000-0000-4000-8000-000000000003",
} as const;

describe("Opportunity tenant and integrity integration", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  function opportunityData(
    overrides: Partial<Prisma.OpportunityUncheckedCreateInput> = {}
  ): Prisma.OpportunityUncheckedCreateInput {
    return {
      organizationId: ids.organizationA,
      pipelineId: ids.pipelineA,
      stageId: ids.stageA,
      companyId: ids.companyA,
      contactId: null,
      ownerUserId: ids.userA,
      title: "Opportunity tenant A",
      estimatedValue: 1000,
      createdBy: ids.userA,
      updatedBy: ids.userA,
      ...overrides,
    };
  }

  beforeAll(async () => {
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

    await admin.organization.createMany({
      data: [
        {
          id: ids.organizationA,
          name: "Opportunity Organization A",
          slug: "opportunity-organization-a",
        },
        {
          id: ids.organizationB,
          name: "Opportunity Organization B",
          slug: "opportunity-organization-b",
        },
      ],
    });

    await admin.user.createMany({
      data: [
        {
          id: ids.userA,
          email: "opportunity-a@example.test",
          emailNormalized: "opportunity-a@example.test",
          displayName: "Opportunity User A",
          passwordHash: "not-used-by-this-test",
        },
        {
          id: ids.userB,
          email: "opportunity-b@example.test",
          emailNormalized: "opportunity-b@example.test",
          displayName: "Opportunity User B",
          passwordHash: "not-used-by-this-test",
        },
      ],
    });

    await admin.organizationMembership.createMany({
      data: [
        {
          id: ids.membershipA,
          organizationId: ids.organizationA,
          userId: ids.userA,
          role: "SELLER",
        },
        {
          id: ids.membershipB,
          organizationId: ids.organizationB,
          userId: ids.userB,
          role: "SELLER",
        },
      ],
    });

    await admin.company.createMany({
      data: [
        {
          id: ids.companyA,
          organizationId: ids.organizationA,
          legalName: "Opportunity Company A",
          createdBy: ids.userA,
          updatedBy: ids.userA,
        },
        {
          id: ids.companyB,
          organizationId: ids.organizationB,
          legalName: "Opportunity Company B",
          createdBy: ids.userB,
          updatedBy: ids.userB,
        },
      ],
    });

    await admin.contact.createMany({
      data: [
        {
          id: ids.contactA,
          organizationId: ids.organizationA,
          fullName: "Opportunity Contact A",
          createdBy: ids.userA,
          updatedBy: ids.userA,
        },
        {
          id: ids.contactB,
          organizationId: ids.organizationB,
          fullName: "Opportunity Contact B",
          createdBy: ids.userB,
          updatedBy: ids.userB,
        },
      ],
    });

    await admin.pipeline.createMany({
      data: [
        {
          id: ids.pipelineA,
          organizationId: ids.organizationA,
          name: "Opportunity Pipeline A",
          normalizedName: "opportunity pipeline a",
        },
        {
          id: ids.pipelineB,
          organizationId: ids.organizationB,
          name: "Opportunity Pipeline B",
          normalizedName: "opportunity pipeline b",
        },
        {
          id: ids.pipelineASecondary,
          organizationId: ids.organizationA,
          name: "Opportunity Pipeline A Secondary",
          normalizedName: "opportunity pipeline a secondary",
        },
      ],
    });

    await admin.pipelineStage.createMany({
      data: [
        {
          id: ids.stageA,
          organizationId: ids.organizationA,
          pipelineId: ids.pipelineA,
          name: "Open A",
          position: 1,
          kind: "OPEN",
        },
        {
          id: ids.stageB,
          organizationId: ids.organizationB,
          pipelineId: ids.pipelineB,
          name: "Open B",
          position: 1,
          kind: "OPEN",
        },
        {
          id: ids.stageASecondary,
          organizationId: ids.organizationA,
          pipelineId: ids.pipelineASecondary,
          name: "Open A Secondary",
          position: 1,
          kind: "OPEN",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it("fails closed and isolates company/contact opportunities across tenants", async () => {
    await prisma.withTenant(ids.organizationA, async tenant => {
      await tenant.opportunity.create({
        data: opportunityData({ id: ids.opportunityACompany }),
      });
      await tenant.opportunity.create({
        data: opportunityData({
          id: ids.opportunityAContact,
          companyId: null,
          contactId: ids.contactA,
          title: "Contact opportunity tenant A",
          estimatedValue: 2500,
        }),
      });
    });

    await prisma.withTenant(ids.organizationB, tenant =>
      tenant.opportunity.create({
        data: opportunityData({
          id: ids.opportunityBContact,
          organizationId: ids.organizationB,
          pipelineId: ids.pipelineB,
          stageId: ids.stageB,
          companyId: null,
          contactId: ids.contactB,
          ownerUserId: ids.userB,
          title: "Contact opportunity tenant B",
          estimatedValue: 500,
          createdBy: ids.userB,
          updatedBy: ids.userB,
        }),
      })
    );

    await expect(prisma.opportunity.findMany()).resolves.toEqual([]);

    const tenantA = await prisma.withTenant(ids.organizationA, tenant =>
      tenant.opportunity.findMany({ orderBy: { title: "asc" } })
    );
    expect(tenantA.map(item => item.id).sort()).toEqual(
      [ids.opportunityACompany, ids.opportunityAContact].sort()
    );

    const tenantB = await prisma.withTenant(ids.organizationB, tenant =>
      tenant.opportunity.findMany()
    );
    expect(tenantB.map(item => item.id)).toEqual([ids.opportunityBContact]);
  });

  it("rejects an organization that differs from the transaction tenant", async () => {
    await expect(
      prisma.withTenant(ids.organizationA, tenant =>
        tenant.opportunity.create({
          data: opportunityData({
            organizationId: ids.organizationB,
            pipelineId: ids.pipelineB,
            stageId: ids.stageB,
            companyId: null,
            contactId: ids.contactB,
            ownerUserId: ids.userB,
            createdBy: ids.userB,
            updatedBy: ids.userB,
          }),
        })
      )
    ).rejects.toThrow();
  });

  it("rejects opportunities with both or neither customer targets", async () => {
    await expect(
      admin.opportunity.create({
        data: opportunityData({ contactId: ids.contactA }),
      })
    ).rejects.toThrow();

    await expect(
      admin.opportunity.create({
        data: opportunityData({ companyId: null, contactId: null }),
      })
    ).rejects.toThrow();
  });

  it("rejects negative estimated values", async () => {
    await expect(
      admin.opportunity.create({
        data: opportunityData({ estimatedValue: -0.01 }),
      })
    ).rejects.toThrow();
  });

  it("rejects company and contact references from another tenant", async () => {
    await expect(
      admin.opportunity.create({
        data: opportunityData({ companyId: ids.companyB }),
      })
    ).rejects.toThrow();

    await expect(
      admin.opportunity.create({
        data: opportunityData({ companyId: null, contactId: ids.contactB }),
      })
    ).rejects.toThrow();
  });

  it("rejects a stage that belongs to another pipeline", async () => {
    await expect(
      admin.opportunity.create({
        data: opportunityData({ stageId: ids.stageASecondary }),
      })
    ).rejects.toThrow();
  });

  it("rejects an owner without membership in the opportunity organization", async () => {
    await expect(
      admin.opportunity.create({
        data: opportunityData({ ownerUserId: ids.userB }),
      })
    ).rejects.toThrow();
  });
});

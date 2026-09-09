import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3 opportunities management API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  async function resetDatabase(): Promise<void> {
    if (!prisma) {
      return;
    }

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE opportunity_stage_history, opportunities, pipeline_stages, pipelines, company_contacts, contacts, companies, audit_logs, refresh_sessions, organization_memberships, users, organizations CASCADE`
    );
  }

  it("lists, reads and updates opportunities only inside the active tenant", async () => {
    const loginSecret = ["Cycle3", "Opportunity", "Management", "2026!"].join(
      "-"
    );
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: "Opportunity Management A",
          slug: "opportunity-management-a",
        },
      }),
      prisma.organization.create({
        data: {
          name: "Opportunity Management B",
          slug: "opportunity-management-b",
        },
      }),
    ]);
    const passwordHash = await passwords.hash(loginSecret);
    const [admin, ownerA, ownerB] = await Promise.all([
      prisma.user.create({
        data: {
          email: "opportunity-management-admin@example.test",
          emailNormalized: "opportunity-management-admin@example.test",
          displayName: "Opportunity Management Admin",
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: "opportunity-management-owner-a@example.test",
          emailNormalized: "opportunity-management-owner-a@example.test",
          displayName: "Opportunity Management Owner A",
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: "opportunity-management-owner-b@example.test",
          emailNormalized: "opportunity-management-owner-b@example.test",
          displayName: "Opportunity Management Owner B",
          passwordHash,
        },
      }),
    ]);

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organizationA.id,
          userId: admin.id,
          role: "ADMIN",
        },
        {
          organizationId: organizationA.id,
          userId: ownerA.id,
          role: "SELLER",
        },
        {
          organizationId: organizationB.id,
          userId: ownerB.id,
          role: "SELLER",
        },
      ],
    });

    const [companyA, otherCompanyA, companyB] = await Promise.all([
      prisma.company.create({
        data: {
          organizationId: organizationA.id,
          legalName: "Management Company A",
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      }),
      prisma.company.create({
        data: {
          organizationId: organizationA.id,
          legalName: "Management Company A2",
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      }),
      prisma.company.create({
        data: {
          organizationId: organizationB.id,
          legalName: "Management Company B",
          createdBy: ownerB.id,
          updatedBy: ownerB.id,
        },
      }),
    ]);
    const contactA = await prisma.contact.create({
      data: {
        organizationId: organizationA.id,
        fullName: "Management Contact A",
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    });
    await prisma.companyContact.create({
      data: {
        organizationId: organizationA.id,
        companyId: companyA.id,
        contactId: contactA.id,
      },
    });

    const [pipelineA, pipelineB] = await Promise.all([
      prisma.pipeline.create({
        data: {
          organizationId: organizationA.id,
          name: "Management Pipeline A",
          isDefault: true,
        },
      }),
      prisma.pipeline.create({
        data: {
          organizationId: organizationB.id,
          name: "Management Pipeline B",
          isDefault: true,
        },
      }),
    ]);
    const [stageA, stageB] = await Promise.all([
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          name: "Management Stage A",
          position: 0,
        },
      }),
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationB.id,
          pipelineId: pipelineB.id,
          name: "Management Stage B",
          position: 0,
        },
      }),
    ]);

    const [opportunityA, otherOpportunityA, opportunityB] = await Promise.all([
      prisma.opportunity.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          stageId: stageA.id,
          companyId: companyA.id,
          contactId: contactA.id,
          ownerUserId: ownerA.id,
          title: "Opportunity A",
          estimatedValue: 1000,
          currency: "BRL",
        },
      }),
      prisma.opportunity.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          stageId: stageA.id,
          companyId: otherCompanyA.id,
          ownerUserId: ownerA.id,
          title: "Opportunity A2",
          estimatedValue: 2000,
          currency: "BRL",
          status: "WON",
        },
      }),
      prisma.opportunity.create({
        data: {
          organizationId: organizationB.id,
          pipelineId: pipelineB.id,
          stageId: stageB.id,
          companyId: companyB.id,
          ownerUserId: ownerB.id,
          title: "Opportunity B",
          estimatedValue: 3000,
          currency: "BRL",
        },
      }),
    ]);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: admin.email,
        password: loginSecret,
        organizationSlug: organizationA.slug,
      })
      .expect(200);
    const accessToken = login.body.accessToken as string;

    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/opportunities?companyId=${companyA.id}&ownerUserId=${ownerA.id}&pipelineId=${pipelineA.id}&stageId=${stageA.id}&status=OPEN`
      )
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body).toMatchObject({
      page: 1,
      total: 1,
    });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(opportunityA.id);

    await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityA.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityB.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityA.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-request-id", "cycle3-opportunity-update")
      .send({
        title: "Opportunity A Updated",
        estimatedValue: 1500,
        contactId: null,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: opportunityA.id,
      title: "Opportunity A Updated",
      contactId: null,
    });
    expect(Number(updated.body.estimatedValue)).toBe(1500);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityB.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Cross tenant mutation" })
      .expect(404);

    const untouchedCrossTenant = await prisma.opportunity.findUnique({
      where: { id: opportunityB.id },
    });
    expect(untouchedCrossTenant?.title).toBe("Opportunity B");

    const untouchedOtherA = await prisma.opportunity.findUnique({
      where: { id: otherOpportunityA.id },
    });
    expect(untouchedOtherA?.status).toBe("WON");

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: organizationA.id,
        entityId: opportunityA.id,
        action: "opportunity.updated",
      },
    });
    expect(audit).not.toBeNull();
  });
});

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3 opportunities API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE opportunity_stage_history, opportunities, pipeline_stages, pipelines, company_contacts, contacts, companies, audit_logs, refresh_sessions, organization_memberships, users, organizations CASCADE`
    );
  }

  async function createUser(email: string, displayName: string, loginSecret: string) {
    return prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        displayName,
        passwordHash: await passwords.hash(loginSecret),
      },
    });
  }

  it("creates an opportunity only with references from the active tenant", async () => {
    const loginSecret = ["Cycle3", "Opportunity", "Fixture", "2026!"].join("-");
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({ data: { name: "Opportunity Organization A", slug: "opportunity-org-a" } }),
      prisma.organization.create({ data: { name: "Opportunity Organization B", slug: "opportunity-org-b" } }),
    ]);
    const [admin, ownerA, ownerB] = await Promise.all([
      createUser("opportunity-admin@example.test", "Opportunity Admin", loginSecret),
      createUser("opportunity-owner-a@example.test", "Opportunity Owner A", loginSecret),
      createUser("opportunity-owner-b@example.test", "Opportunity Owner B", loginSecret),
    ]);

    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: organizationA.id, userId: admin.id, role: "ADMIN" },
        { organizationId: organizationA.id, userId: ownerA.id, role: "SELLER" },
        { organizationId: organizationB.id, userId: ownerB.id, role: "SELLER" },
      ],
    });

    const [companyA, companyB] = await Promise.all([
      prisma.company.create({ data: { organizationId: organizationA.id, legalName: "Company A", createdBy: admin.id, updatedBy: admin.id } }),
      prisma.company.create({ data: { organizationId: organizationB.id, legalName: "Company B", createdBy: ownerB.id, updatedBy: ownerB.id } }),
    ]);
    const [contactA, contactB] = await Promise.all([
      prisma.contact.create({ data: { organizationId: organizationA.id, fullName: "Contact A", createdBy: admin.id, updatedBy: admin.id } }),
      prisma.contact.create({ data: { organizationId: organizationB.id, fullName: "Contact B", createdBy: ownerB.id, updatedBy: ownerB.id } }),
    ]);
    await prisma.companyContact.create({
      data: { organizationId: organizationA.id, companyId: companyA.id, contactId: contactA.id },
    });

    const [pipelineA, pipelineB] = await Promise.all([
      prisma.pipeline.create({ data: { organizationId: organizationA.id, name: "Pipeline A", isDefault: true } }),
      prisma.pipeline.create({ data: { organizationId: organizationB.id, name: "Pipeline B", isDefault: true } }),
    ]);
    const [stageA, stageB] = await Promise.all([
      prisma.pipelineStage.create({ data: { organizationId: organizationA.id, pipelineId: pipelineA.id, name: "Stage A", position: 0 } }),
      prisma.pipelineStage.create({ data: { organizationId: organizationB.id, pipelineId: pipelineB.id, name: "Stage B", position: 0 } }),
    ]);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: loginSecret, organizationSlug: organizationA.slug })
      .expect(200);
    const accessToken = login.body.accessToken as string;
    const validPayload = {
      companyId: companyA.id,
      contactId: contactA.id,
      ownerUserId: ownerA.id,
      pipelineId: pipelineA.id,
      stageId: stageA.id,
      title: "Nova oportunidade",
      estimatedValue: 12500.5,
      currency: "BRL",
      expectedCloseDate: "2026-10-31",
    };

    const created = await request(app.getHttpServer())
      .post("/api/v1/opportunities")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload)
      .expect(201);

    expect(created.body).toMatchObject({
      organizationId: organizationA.id,
      companyId: companyA.id,
      contactId: contactA.id,
      ownerUserId: ownerA.id,
      pipelineId: pipelineA.id,
      stageId: stageA.id,
      status: "OPEN",
    });

    for (const invalidReference of [
      { companyId: companyB.id },
      { contactId: contactB.id },
      { ownerUserId: ownerB.id },
      { pipelineId: pipelineB.id, stageId: stageB.id },
      { stageId: stageB.id },
    ]) {
      await request(app.getHttpServer())
        .post("/api/v1/opportunities")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ ...validPayload, ...invalidReference })
        .expect(404);
    }
  });
});

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3.6.2 opportunities API", () => {
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
      `TRUNCATE TABLE
         opportunities,
         activities,
         contact_custom_field_values,
         company_custom_field_values,
         custom_field_definitions,
         contact_tags,
         company_tags,
         tags,
         relationship_entries,
         company_contacts,
         contact_channels,
         contacts,
         companies,
         pipeline_stages,
         pipelines,
         audit_logs,
         refresh_sessions,
         organization_memberships,
         users,
         organizations
       CASCADE`
    );
  }

  async function createUser(input: {
    email: string;
    password: string;
    displayName: string;
  }) {
    return prisma.user.create({
      data: {
        email: input.email,
        emailNormalized: input.email.toLowerCase(),
        displayName: input.displayName,
        passwordHash: await passwords.hash(input.password),
      },
    });
  }

  async function login(input: {
    email: string;
    password: string;
    organizationSlug: string;
  }): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send(input)
      .expect(200);

    return response.body.accessToken as string;
  }

  it("creates, reads and lists an opportunity inside the authenticated tenant", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Opportunity Organization", slug: "opportunity-org" },
    });
    const password = "Strong-Opportunity-Password-2026!";
    const user = await createUser({
      email: "opportunity-admin@example.test",
      password,
      displayName: "Opportunity Admin",
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Cliente Opportunity",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );

    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });

    const pipeline = await request(app.getHttpServer())
      .post("/api/v1/pipelines/default")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const stage = pipeline.body.stages[0] as { id: string };

    const created = await request(app.getHttpServer())
      .post("/api/v1/opportunities")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-6-2-opportunity-create")
      .send({
        pipelineId: pipeline.body.id,
        stageId: stage.id,
        companyId: company.id,
        ownerUserId: user.id,
        title: "Contrato Enterprise",
        estimatedValue: "150000.00",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      organizationId: organization.id,
      pipelineId: pipeline.body.id,
      stageId: stage.id,
      companyId: company.id,
      contactId: null,
      ownerUserId: user.id,
      title: "Contrato Enterprise",
      estimatedValue: "150000.00",
      version: 1,
    });

    const read = await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(read.body.id).toBe(created.body.id);

    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/opportunities?q=Enterprise&pipelineId=${pipeline.body.id}&page=1&limit=20`
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(created.body.id);
  });
});

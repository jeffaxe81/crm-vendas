import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C3.6.3 activity opportunity API", () => {
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
         activities,
         opportunities,
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

  it("creates, reads and filters activities by opportunityId", async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Activity Opportunity API Org",
        slug: "activity-opportunity-api",
      },
    });
    const password = "activity-opportunity-api-password";
    const user = await createUser({
      email: "activity-opportunity-api@example.test",
      password,
      displayName: "Activity Opportunity API User",
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const pipeline = await prisma.withTenant(organization.id, tenant =>
      tenant.pipeline.create({
        data: {
          organizationId: organization.id,
          name: "Pipeline Opportunity API",
          normalizedName: "pipeline opportunity api",
        },
      })
    );
    const stage = await prisma.withTenant(organization.id, tenant =>
      tenant.pipelineStage.create({
        data: {
          organizationId: organization.id,
          pipelineId: pipeline.id,
          name: "Aberta",
          position: 1,
          kind: "OPEN",
        },
      })
    );
    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Cliente Opportunity API",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const opportunity = await prisma.withTenant(organization.id, tenant =>
      tenant.opportunity.create({
        data: {
          organizationId: organization.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          companyId: company.id,
          ownerUserId: user.id,
          title: "Opportunity API",
          estimatedValue: "2500.00",
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

    const linked = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-6-3-activity-opportunity-create")
      .send({
        type: "TASK",
        title: "Follow-up da oportunidade",
        ownerUserId: user.id,
        opportunityId: opportunity.id,
      })
      .expect(201);

    expect(linked.body.opportunityId).toBe(opportunity.id);

    const linkedId = linked.body.id as string;
    const read = await request(app.getHttpServer())
      .get(`/api/v1/activities/${linkedId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(read.body.opportunityId).toBe(opportunity.id);

    const unlinked = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-6-3-activity-without-opportunity")
      .send({
        type: "TASK",
        title: "Atividade sem oportunidade",
        ownerUserId: user.id,
      })
      .expect(201);

    expect(unlinked.body.opportunityId).toBeNull();

    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/activities?opportunityId=${opportunity.id}&page=1&limit=20`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(filtered.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0]).toMatchObject({
      id: linkedId,
      opportunityId: opportunity.id,
    });
  });
});

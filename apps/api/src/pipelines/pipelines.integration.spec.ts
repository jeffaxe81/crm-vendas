import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3 pipelines API", () => {
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
         opportunity_stage_history,
         opportunities,
         pipeline_stages,
         pipelines,
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

  it("creates, lists, reads and updates only pipelines from the authenticated organization", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Pipeline Organization A", slug: "pipeline-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Pipeline Organization B", slug: "pipeline-org-b" },
      }),
    ]);
    const password = "Strong-Pipeline-Password-2026!";
    const user = await createUser({
      email: "pipelines-admin@example.test",
      password,
      displayName: "Pipelines Admin",
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organizationA.id,
          userId: user.id,
          role: "ADMIN",
        },
        {
          organizationId: organizationB.id,
          userId: user.id,
          role: "ADMIN",
        },
      ],
    });

    const pipelineB = await prisma.pipeline.create({
      data: {
        organizationId: organizationB.id,
        name: "Pipeline B",
      },
    });
    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/pipelines")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle3-pipeline-create")
      .send({ name: "Pipeline A", isDefault: false })
      .expect(201);

    expect(created.body).toMatchObject({
      name: "Pipeline A",
      organizationId: organizationA.id,
      isDefault: false,
      isActive: true,
    });
    const pipelineAId = created.body.id as string;

    const list = await request(app.getHttpServer())
      .get("/api/v1/pipelines")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: pipelineAId, name: "Pipeline A" });

    await request(app.getHttpServer())
      .get(`/api/v1/pipelines/${pipelineAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/pipelines/${pipelineB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/pipelines/${pipelineAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle3-pipeline-update")
      .send({ name: "Pipeline A Atualizado" })
      .expect(200);

    expect(updated.body.name).toBe("Pipeline A Atualizado");

    await request(app.getHttpServer())
      .patch(`/api/v1/pipelines/${pipelineB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Tentativa cruzada" })
      .expect(404);

    const untouchedPipelineB = await prisma.pipeline.findUnique({
      where: { id: pipelineB.id },
    });
    expect(untouchedPipelineB?.name).toBe("Pipeline B");

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: organizationA.id,
        entityId: pipelineAId,
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(auditActions.map(item => item.action)).toEqual([
      "pipeline.created",
      "pipeline.updated",
    ]);
  });
});

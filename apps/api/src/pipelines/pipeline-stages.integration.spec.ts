import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3 pipeline stages API", () => {
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

  it("creates, updates, reorders and deactivates stages only inside the target pipeline and tenant", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Stage Organization A", slug: "stage-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Stage Organization B", slug: "stage-org-b" },
      }),
    ]);
    const password = "Strong-Stage-Password-2026!";
    const user = await createUser({
      email: "stages-admin@example.test",
      password,
      displayName: "Stages Admin",
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

    const [pipelineA, otherPipelineA, pipelineB] = await Promise.all([
      prisma.pipeline.create({
        data: { organizationId: organizationA.id, name: "Pipeline A" },
      }),
      prisma.pipeline.create({
        data: { organizationId: organizationA.id, name: "Other Pipeline A" },
      }),
      prisma.pipeline.create({
        data: { organizationId: organizationB.id, name: "Pipeline B" },
      }),
    ]);
    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/pipelines/${pipelineA.id}/stages`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Qualificação", position: 0 })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/pipelines/${pipelineA.id}/stages`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Proposta", position: 1 })
      .expect(201);

    const firstId = first.body.id as string;
    const secondId = second.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/pipelines/${pipelineA.id}/stages/${firstId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Qualificação Atualizada" })
      .expect(200);
    expect(updated.body.name).toBe("Qualificação Atualizada");

    await request(app.getHttpServer())
      .patch(`/api/v1/pipelines/${pipelineA.id}/stages/reorder`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ stageIds: [secondId, firstId] })
      .expect(200);

    const reordered = await prisma.pipelineStage.findMany({
      where: { pipelineId: pipelineA.id, isActive: true },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    expect(reordered).toEqual([
      { id: secondId, position: 0 },
      { id: firstId, position: 1 },
    ]);

    const otherStageA = await prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        pipelineId: otherPipelineA.id,
        name: "Outra Etapa A",
        position: 0,
      },
    });
    const stageB = await prisma.pipelineStage.create({
      data: {
        organizationId: organizationB.id,
        pipelineId: pipelineB.id,
        name: "Etapa B",
        position: 0,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/pipelines/${pipelineA.id}/stages/reorder`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ stageIds: [secondId, otherStageA.id] })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/pipelines/${pipelineA.id}/stages/${stageB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Tentativa cruzada" })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/pipelines/${pipelineA.id}/stages/${firstId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);

    const inactive = await prisma.pipelineStage.findUnique({
      where: { id: firstId },
    });
    expect(inactive?.isActive).toBe(false);
  });
});

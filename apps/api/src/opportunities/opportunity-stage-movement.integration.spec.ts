import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3 opportunity stage movement", () => {
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

  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE opportunity_stage_history, opportunities, pipeline_stages, pipelines, companies, audit_logs, refresh_sessions, organization_memberships, users, organizations CASCADE`
    );
  }

  it("moves only open opportunities inside the same active pipeline and tenant and appends immutable history", async () => {
    const loginSecret = ["Cycle3", "Movement", "Fixture", "2026!"].join("-");
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Movement A", slug: "movement-a" },
      }),
      prisma.organization.create({
        data: { name: "Movement B", slug: "movement-b" },
      }),
    ]);
    const [admin, ownerB] = await Promise.all([
      prisma.user.create({
        data: {
          email: "movement-admin@example.test",
          emailNormalized: "movement-admin@example.test",
          displayName: "Movement Admin",
          passwordHash: await passwords.hash(loginSecret),
        },
      }),
      prisma.user.create({
        data: {
          email: "movement-owner-b@example.test",
          emailNormalized: "movement-owner-b@example.test",
          displayName: "Movement Owner B",
          passwordHash: await passwords.hash(loginSecret),
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
          organizationId: organizationB.id,
          userId: ownerB.id,
          role: "SELLER",
        },
      ],
    });

    const [companyA, companyB] = await Promise.all([
      prisma.company.create({
        data: {
          organizationId: organizationA.id,
          legalName: "Movement Company A",
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      }),
      prisma.company.create({
        data: {
          organizationId: organizationB.id,
          legalName: "Movement Company B",
          createdBy: ownerB.id,
          updatedBy: ownerB.id,
        },
      }),
    ]);

    const [pipelineA, pipelineOtherA, pipelineB] = await Promise.all([
      prisma.pipeline.create({
        data: {
          organizationId: organizationA.id,
          name: "Pipeline A",
          isDefault: true,
        },
      }),
      prisma.pipeline.create({
        data: {
          organizationId: organizationA.id,
          name: "Pipeline Other A",
        },
      }),
      prisma.pipeline.create({
        data: {
          organizationId: organizationB.id,
          name: "Pipeline B",
          isDefault: true,
        },
      }),
    ]);
    const [
      stageFrom,
      stageTo,
      stageInactive,
      stageOtherPipeline,
      stageTenantB,
    ] = await Promise.all([
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          name: "Lead",
          position: 0,
        },
      }),
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          name: "Qualified",
          position: 1,
        },
      }),
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          name: "Inactive",
          position: 2,
          isActive: false,
        },
      }),
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineOtherA.id,
          name: "Other",
          position: 0,
        },
      }),
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationB.id,
          pipelineId: pipelineB.id,
          name: "Tenant B",
          position: 0,
        },
      }),
    ]);

    const [opportunity, closedOpportunity] = await Promise.all([
      prisma.opportunity.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          stageId: stageFrom.id,
          companyId: companyA.id,
          ownerUserId: admin.id,
          title: "Movable",
          estimatedValue: 1000,
          currency: "BRL",
        },
      }),
      prisma.opportunity.create({
        data: {
          organizationId: organizationA.id,
          pipelineId: pipelineA.id,
          stageId: stageFrom.id,
          companyId: companyA.id,
          ownerUserId: admin.id,
          title: "Closed",
          estimatedValue: 500,
          currency: "BRL",
          status: "WON",
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
    const token = login.body.accessToken as string;

    const moved = await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${opportunity.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stageId: stageTo.id })
      .expect(200);

    expect(moved.body.stageId).toBe(stageTo.id);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunity.id}/stage-history`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      organizationId: organizationA.id,
      opportunityId: opportunity.id,
      fromStageId: stageFrom.id,
      toStageId: stageTo.id,
      actorUserId: admin.id,
    });

    const movementAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: organizationA.id,
        action: "opportunity.stage_moved",
        entityId: opportunity.id,
      },
    });
    expect(movementAudit).toMatchObject({
      actorUserId: admin.id,
      entityType: "opportunity",
    });

    for (const invalidStageId of [
      stageInactive.id,
      stageOtherPipeline.id,
      stageTenantB.id,
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/opportunities/${opportunity.id}/move`)
        .set("Authorization", `Bearer ${token}`)
        .send({ stageId: invalidStageId })
        .expect(404);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${closedOpportunity.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stageId: stageTo.id })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${opportunity.id}/stage-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fromStageId: stageFrom.id, toStageId: stageTo.id })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunity.id}/stage-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fromStageId: stageFrom.id, toStageId: stageTo.id })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/opportunities/${opportunity.id}/stage-history`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    const persisted = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunity.id },
    });
    expect(persisted.stageId).toBe(stageTo.id);

    const tenantBOpportunity = await prisma.opportunity.create({
      data: {
        organizationId: organizationB.id,
        pipelineId: pipelineB.id,
        stageId: stageTenantB.id,
        companyId: companyB.id,
        ownerUserId: ownerB.id,
        title: "Tenant B Opportunity",
        estimatedValue: 100,
        currency: "BRL",
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${tenantBOpportunity.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stageId: stageTo.id })
      .expect(404);
  });
});

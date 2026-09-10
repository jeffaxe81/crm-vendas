import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3.6.2 opportunity boundaries", () => {
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

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      opportunities, activities, contact_custom_field_values,
      company_custom_field_values, custom_field_definitions, contact_tags,
      company_tags, tags, relationship_entries, company_contacts,
      contact_channels, contacts, companies, pipeline_stages, pipelines,
      audit_logs, refresh_sessions, organization_memberships, users, organizations
      CASCADE`);
  });

  afterAll(async () => {
    await app.close();
  });

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

  async function login(email: string, password: string, organizationSlug: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function createFixture(suffix: string) {
    const organization = await prisma.organization.create({
      data: {
        name: `Boundary Organization ${suffix}`,
        slug: `boundary-org-${suffix}`,
      },
    });
    const password = "Strong-Boundary-Password-2026!";
    const admin = await createUser({
      email: `boundary-admin-${suffix}@example.test`,
      password,
      displayName: `Boundary Admin ${suffix}`,
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: admin.id, role: "ADMIN" },
    });
    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Boundary Company ${suffix}`,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      })
    );
    const adminToken = await login(admin.email, password, organization.slug);
    const pipeline = await request(app.getHttpServer())
      .post("/api/v1/pipelines/default")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const firstStageId = pipeline.body.stages[0].id as string;
    const secondStageId = pipeline.body.stages[1].id as string;

    return {
      organization,
      admin,
      adminToken,
      company,
      pipelineId: pipeline.body.id as string,
      firstStageId,
      secondStageId,
    };
  }

  async function addMember(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    role: "VIEWER" | "SELLER",
    suffix: string
  ) {
    const password = `Strong-${role}-${suffix}-Password-2026!`;
    const user = await createUser({
      email: `${role.toLowerCase()}-${suffix}@example.test`,
      password,
      displayName: `${role} ${suffix}`,
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: fixture.organization.id,
        userId: user.id,
        role,
      },
    });
    const token = await login(user.email, password, fixture.organization.slug);
    return { user, token };
  }

  async function createOpportunity(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    token = fixture.adminToken,
    ownerUserId = fixture.admin.id,
    title = "Boundary Opportunity"
  ) {
    return request(app.getHttpServer())
      .post("/api/v1/opportunities")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pipelineId: fixture.pipelineId,
        stageId: fixture.firstStageId,
        companyId: fixture.company.id,
        ownerUserId,
        title,
        estimatedValue: "1000.00",
      });
  }

  it("soft deletes an opportunity, hides it from reads and records the deletion audit", async () => {
    const fixture = await createFixture("soft-delete");
    const created = await createOpportunity(fixture);
    expect(created.status).toBe(201);
    const opportunityId = created.body.id as string;

    await request(app.getHttpServer())
      .delete(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.adminToken}`)
      .set("x-request-id", "c3-6-2-opportunity-delete")
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.adminToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get("/api/v1/opportunities?page=1&limit=20")
      .set("Authorization", `Bearer ${fixture.adminToken}`)
      .expect(200);
    expect(list.body.total).toBe(0);

    const deleted = await prisma.$queryRaw<
      Array<{ deleted_at: Date | null; deleted_by: string | null; version: number }>
    >`SELECT deleted_at, deleted_by, version FROM opportunities WHERE id = ${opportunityId}::uuid`;
    expect(deleted[0]?.deleted_at).toBeInstanceOf(Date);
    expect(deleted[0]?.deleted_by).toBe(fixture.admin.id);
    expect(deleted[0]?.version).toBe(2);

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: fixture.organization.id,
        entityId: opportunityId,
        action: "opportunity.deleted",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toMatchObject({ version: 1 });
    expect(audit[0]?.after).toMatchObject({ version: 2 });
  });

  it("keeps VIEWER read-only across opportunity write, move and delete endpoints", async () => {
    const fixture = await createFixture("viewer");
    const created = await createOpportunity(fixture);
    expect(created.status).toBe(201);
    const opportunityId = created.body.id as string;
    const viewer = await addMember(fixture, "VIEWER", "readonly");

    await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);

    await createOpportunity(fixture, viewer.token, viewer.user.id, "Viewer cannot create").expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ title: "Viewer cannot update", version: 1 })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ stageId: fixture.secondStageId, version: 1 })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(403);
  });

  it("allows SELLER to create, update, move and soft delete opportunities", async () => {
    const fixture = await createFixture("seller");
    const seller = await addMember(fixture, "SELLER", "writer");

    const created = await createOpportunity(
      fixture,
      seller.token,
      seller.user.id,
      "Seller Opportunity"
    );
    expect(created.status).toBe(201);
    const opportunityId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ title: "Seller Updated", version: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ stageId: fixture.secondStageId, version: 2 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(204);
  });

  it("returns 404 when tenant A tries to read or mutate tenant B opportunity", async () => {
    const tenantA = await createFixture("tenant-a");
    const tenantB = await createFixture("tenant-b");
    const createdB = await createOpportunity(tenantB);
    expect(createdB.status).toBe(201);
    const opportunityId = createdB.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${tenantA.adminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${tenantA.adminToken}`)
      .send({ title: "Cross tenant update", version: 1 })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set("Authorization", `Bearer ${tenantA.adminToken}`)
      .send({ stageId: tenantA.secondStageId, version: 1 })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${tenantA.adminToken}`)
      .expect(404);

    const stillPresent = await prisma.withTenant(tenantB.organization.id, tenant =>
      tenant.opportunity.findFirst({
        where: { id: opportunityId, organizationId: tenantB.organization.id },
      })
    );
    expect(stillPresent?.deletedAt).toBeNull();
  });

  it("rejects inactive Pipeline or Stage references during creation", async () => {
    const pipelineFixture = await createFixture("inactive-pipeline");
    await prisma.withTenant(pipelineFixture.organization.id, tenant =>
      tenant.pipeline.update({
        where: { id: pipelineFixture.pipelineId },
        data: { isActive: false },
      })
    );
    const inactivePipeline = await createOpportunity(pipelineFixture);
    expect(inactivePipeline.status).toBe(404);
    expect(inactivePipeline.body.code).toBe("OPPORTUNITY_REFERENCE_NOT_FOUND");

    const stageFixture = await createFixture("inactive-stage");
    await prisma.withTenant(stageFixture.organization.id, tenant =>
      tenant.pipelineStage.update({
        where: { id: stageFixture.firstStageId },
        data: { isActive: false },
      })
    );
    const inactiveStage = await createOpportunity(stageFixture);
    expect(inactiveStage.status).toBe(404);
    expect(inactiveStage.body.code).toBe("OPPORTUNITY_REFERENCE_NOT_FOUND");
  });
});

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

  async function createFixture(suffix = "base") {
    const organization = await prisma.organization.create({
      data: {
        name: `Opportunity Organization ${suffix}`,
        slug: `opportunity-org-${suffix}`,
      },
    });
    const password = "Strong-Opportunity-Password-2026!";
    const user = await createUser({
      email: `opportunity-admin-${suffix}@example.test`,
      password,
      displayName: `Opportunity Admin ${suffix}`,
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
          legalName: `Cliente Opportunity ${suffix}`,
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const contact = await prisma.withTenant(organization.id, tenant =>
      tenant.contact.create({
        data: {
          organizationId: organization.id,
          fullName: `Contato Opportunity ${suffix}`,
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
    const secondStage = pipeline.body.stages[1] as { id: string };

    return {
      organization,
      user,
      company,
      contact,
      token,
      pipelineId: pipeline.body.id as string,
      stageId: stage.id,
      secondStageId: secondStage.id,
    };
  }

  async function createOpportunity(
    fixture: Awaited<ReturnType<typeof createFixture>>
  ) {
    return request(app.getHttpServer())
      .post("/api/v1/opportunities")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c3-6-2-opportunity-create")
      .send({
        pipelineId: fixture.pipelineId,
        stageId: fixture.stageId,
        companyId: fixture.company.id,
        ownerUserId: fixture.user.id,
        title: "Contrato Enterprise",
        estimatedValue: "150000.00",
      })
      .expect(201);
  }

  it("creates, reads and lists an opportunity inside the authenticated tenant", async () => {
    const fixture = await createFixture("lifecycle");
    const created = await createOpportunity(fixture);

    expect(created.body).toMatchObject({
      organizationId: fixture.organization.id,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      companyId: fixture.company.id,
      contactId: null,
      ownerUserId: fixture.user.id,
      title: "Contrato Enterprise",
      estimatedValue: "150000.00",
      version: 1,
    });

    const read = await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${created.body.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);

    expect(read.body.id).toBe(created.body.id);

    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/opportunities?q=Enterprise&pipelineId=${fixture.pipelineId}&page=1&limit=20`
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);

    expect(list.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(created.body.id);
  });

  it("updates mutable fields, switches Company to Contact atomically and rejects a stale version", async () => {
    const fixture = await createFixture("update");
    const created = await createOpportunity(fixture);
    const opportunityId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c3-6-2-opportunity-update")
      .send({
        companyId: null,
        contactId: fixture.contact.id,
        title: "Contrato revisado",
        estimatedValue: "175000.25",
        version: 1,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      companyId: null,
      contactId: fixture.contact.id,
      title: "Contrato revisado",
      estimatedValue: "175000.25",
      version: 2,
    });

    const stale = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ title: "Stale", version: 1 })
      .expect(409);

    expect(stale.body.code).toBe("OPPORTUNITY_VERSION_CONFLICT");

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: fixture.organization.id,
        entityId: opportunityId,
        action: "opportunity.updated",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toMatchObject({ version: 1 });
    expect(audit[0]?.after).toMatchObject({ version: 2 });
  });

  it("rejects a cross-tenant customer and an owner without active membership", async () => {
    const fixture = await createFixture("references");
    const created = await createOpportunity(fixture);
    const opportunityId = created.body.id as string;

    const other = await createFixture("other-tenant");

    const crossTenant = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        companyId: other.company.id,
        contactId: null,
        version: 1,
      })
      .expect(404);

    expect(crossTenant.body.code).toBe("OPPORTUNITY_REFERENCE_NOT_FOUND");

    const inactiveOwner = await createUser({
      email: "opportunity-inactive-owner@example.test",
      password: "Strong-Inactive-Owner-Password-2026!",
      displayName: "Inactive Opportunity Owner",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: fixture.organization.id,
        userId: inactiveOwner.id,
        role: "SELLER",
        isActive: false,
      },
    });

    const inactive = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ ownerUserId: inactiveOwner.id, version: 1 })
      .expect(404);

    expect(inactive.body.code).toBe("OPPORTUNITY_REFERENCE_NOT_FOUND");
  });

  it("rejects pipelineId and stageId on the general opportunity PATCH", async () => {
    const fixture = await createFixture("immutable-routing");
    const created = await createOpportunity(fixture);
    const opportunityId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        title: "Não deve alterar pipeline",
        pipelineId: fixture.pipelineId,
        version: 1,
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        title: "Não deve alterar stage",
        stageId: fixture.stageId,
        version: 1,
      })
      .expect(400);
  });

  it("moves an opportunity to another active stage in the same pipeline", async () => {
    const fixture = await createFixture("move-same-pipeline");
    const created = await createOpportunity(fixture);
    const opportunityId = created.body.id as string;

    const moved = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c3-6-2-opportunity-move")
      .send({ stageId: fixture.secondStageId, version: 1 })
      .expect(200);

    expect(moved.body).toMatchObject({
      id: opportunityId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.secondStageId,
      version: 2,
    });

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: fixture.organization.id,
        entityId: opportunityId,
        action: "opportunity.moved",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toMatchObject({
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      version: 1,
    });
    expect(audit[0]?.after).toMatchObject({
      pipelineId: fixture.pipelineId,
      stageId: fixture.secondStageId,
      version: 2,
    });
  });

  it("rejects a destination stage that belongs to another pipeline", async () => {
    const fixture = await createFixture("move-cross-pipeline");
    const created = await createOpportunity(fixture);
    const opportunityId = created.body.id as string;

    const otherStage = await prisma.withTenant(
      fixture.organization.id,
      async tenant => {
        const pipeline = await tenant.pipeline.create({
          data: {
            organizationId: fixture.organization.id,
            name: "Funil Alternativo",
            normalizedName: "funil alternativo",
          },
        });
        return tenant.pipelineStage.create({
          data: {
            organizationId: fixture.organization.id,
            pipelineId: pipeline.id,
            name: "Etapa Alternativa",
            position: 1,
            kind: "OPEN",
          },
        });
      }
    );

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ stageId: otherStage.id, version: 1 })
      .expect(404);

    expect(response.body.code).toBe("OPPORTUNITY_REFERENCE_NOT_FOUND");
  });

  it("rejects a stage movement with a stale opportunity version", async () => {
    const fixture = await createFixture("move-stale");
    const created = await createOpportunity(fixture);
    const opportunityId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ title: "Atualizada antes do move", version: 1 })
      .expect(200);

    const stale = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ stageId: fixture.secondStageId, version: 1 })
      .expect(409);

    expect(stale.body.code).toBe("OPPORTUNITY_VERSION_CONFLICT");
  });
});

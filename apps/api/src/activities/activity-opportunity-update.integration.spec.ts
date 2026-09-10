import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C3.6.3 activity opportunity update API", () => {
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
      `TRUNCATE TABLE activities, opportunities, contact_custom_field_values,
       company_custom_field_values, custom_field_definitions, contact_tags,
       company_tags, tags, relationship_entries, company_contacts,
       contact_channels, contacts, companies, pipeline_stages, pipelines,
       audit_logs, refresh_sessions, organization_memberships, users,
       organizations CASCADE`
    );
  }

  async function seed() {
    const organization = await prisma.organization.create({
      data: {
        name: "Activity Opportunity Update Org",
        slug: "activity-opportunity-update",
      },
    });
    const credential = `C3-update-${randomUUID()}!`;
    const user = await prisma.user.create({
      data: {
        email: "activity-opportunity-update@example.test",
        emailNormalized: "activity-opportunity-update@example.test",
        displayName: "Activity Opportunity Update User",
        passwordHash: await passwords.hash(credential),
      },
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
          name: "Pipeline Update",
          normalizedName: "pipeline update",
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
          legalName: "Cliente Opportunity Update",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const [opportunityA, opportunityB] = await prisma.withTenant(
      organization.id,
      tenant =>
        Promise.all([
          tenant.opportunity.create({
            data: {
              organizationId: organization.id,
              pipelineId: pipeline.id,
              stageId: stage.id,
              companyId: company.id,
              ownerUserId: user.id,
              title: "Opportunity A",
              estimatedValue: "1000.00",
              createdBy: user.id,
              updatedBy: user.id,
            },
          }),
          tenant.opportunity.create({
            data: {
              organizationId: organization.id,
              pipelineId: pipeline.id,
              stageId: stage.id,
              companyId: company.id,
              ownerUserId: user.id,
              title: "Opportunity B",
              estimatedValue: "2000.00",
              createdBy: user.id,
              updatedBy: user.id,
            },
          }),
        ])
    );

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: user.email,
        password: credential,
        organizationSlug: organization.slug,
      })
      .expect(200);

    return {
      organization,
      user,
      opportunityA,
      opportunityB,
      token: login.body.accessToken as string,
    };
  }

  async function createActivity(
    token: string,
    ownerUserId: string,
    opportunityId?: string
  ) {
    return request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "TASK",
        title: "Atividade de atualização",
        ownerUserId,
        ...(opportunityId ? { opportunityId } : {}),
      })
      .expect(201);
  }

  it("links an unlinked activity to an opportunity", async () => {
    const { user, opportunityA, token } = await seed();
    const created = await createActivity(token, user.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ opportunityId: opportunityA.id })
      .expect(200);

    expect(updated.body.opportunityId).toBe(opportunityA.id);
  });

  it("swaps opportunities and audits before and after", async () => {
    const { organization, user, opportunityA, opportunityB, token } =
      await seed();
    const created = await createActivity(token, user.id, opportunityA.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-6-3-swap-opportunity")
      .send({ opportunityId: opportunityB.id })
      .expect(200);

    expect(updated.body.opportunityId).toBe(opportunityB.id);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        entityId: created.body.id as string,
        requestId: "c3-6-3-swap-opportunity",
        action: "activity.updated",
      },
    });
    expect(audit.before).toMatchObject({ opportunityId: opportunityA.id });
    expect(audit.after).toMatchObject({ opportunityId: opportunityB.id });
  });

  it("preserves the opportunity when opportunityId is omitted", async () => {
    const { user, opportunityA, token } = await seed();
    const created = await createActivity(token, user.id, opportunityA.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Título atualizado" })
      .expect(200);

    expect(updated.body.opportunityId).toBe(opportunityA.id);
  });

  it("unlinks with null and audits before and after", async () => {
    const { organization, user, opportunityA, token } = await seed();
    const created = await createActivity(token, user.id, opportunityA.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-6-3-unlink-opportunity")
      .send({ opportunityId: null })
      .expect(200);

    expect(updated.body.opportunityId).toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        entityId: created.body.id as string,
        requestId: "c3-6-3-unlink-opportunity",
        action: "activity.updated",
      },
    });
    expect(audit.before).toMatchObject({ opportunityId: opportunityA.id });
    expect(audit.after).toMatchObject({ opportunityId: null });
  });
});

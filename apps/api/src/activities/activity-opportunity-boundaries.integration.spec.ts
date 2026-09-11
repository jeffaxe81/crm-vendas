import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C3.6.3 activity opportunity boundaries", () => {
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

  async function createMember(
    organization: { id: string; slug: string },
    role: "ADMIN" | "SELLER" | "VIEWER",
    label: string
  ) {
    const credential = `C3-boundary-${randomUUID()}!`;
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `Boundary ${label}`,
        passwordHash: await passwords.hash(credential),
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role,
      },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email,
        password: credential,
        organizationSlug: organization.slug,
      })
      .expect(200);

    return { user, token: login.body.accessToken as string };
  }

  async function createOpportunity(
    organizationId: string,
    ownerUserId: string,
    label: string
  ) {
    const pipeline = await prisma.withTenant(organizationId, tenant =>
      tenant.pipeline.create({
        data: {
          organizationId,
          name: `Pipeline ${label}`,
          normalizedName: `pipeline ${label.toLowerCase()}`,
        },
      })
    );
    const stage = await prisma.withTenant(organizationId, tenant =>
      tenant.pipelineStage.create({
        data: {
          organizationId,
          pipelineId: pipeline.id,
          name: "Aberta",
          position: 1,
          kind: "OPEN",
        },
      })
    );
    const company = await prisma.withTenant(organizationId, tenant =>
      tenant.company.create({
        data: {
          organizationId,
          legalName: `Cliente ${label}`,
          createdBy: ownerUserId,
          updatedBy: ownerUserId,
        },
      })
    );

    return prisma.withTenant(organizationId, tenant =>
      tenant.opportunity.create({
        data: {
          organizationId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          companyId: company.id,
          ownerUserId,
          title: `Opportunity ${label}`,
          estimatedValue: "1500.00",
          createdBy: ownerUserId,
          updatedBy: ownerUserId,
        },
      })
    );
  }

  it("rejects cross-tenant opportunity references on create and update", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Boundary Org A", slug: "boundary-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Boundary Org B", slug: "boundary-org-b" },
      }),
    ]);
    const memberA = await createMember(organizationA, "ADMIN", "admin-a");
    const memberB = await createMember(organizationB, "ADMIN", "admin-b");
    const opportunityB = await createOpportunity(
      organizationB.id,
      memberB.user.id,
      "Tenant B"
    );

    const createRejected = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${memberA.token}`)
      .send({
        type: "TASK",
        title: "Cross-tenant create",
        ownerUserId: memberA.user.id,
        opportunityId: opportunityB.id,
      })
      .expect(404);
    expect(createRejected.body.code).toBe("ACTIVITY_REFERENCE_NOT_FOUND");

    const localActivity = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${memberA.token}`)
      .send({
        type: "TASK",
        title: "Local activity",
        ownerUserId: memberA.user.id,
      })
      .expect(201);

    const updateRejected = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${localActivity.body.id as string}`)
      .set("Authorization", `Bearer ${memberA.token}`)
      .send({ opportunityId: opportunityB.id })
      .expect(404);
    expect(updateRejected.body.code).toBe("ACTIVITY_REFERENCE_NOT_FOUND");

    await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${memberB.token}`)
      .send({
        type: "TASK",
        title: "Tenant B linked activity",
        ownerUserId: memberB.user.id,
        opportunityId: opportunityB.id,
      })
      .expect(201);

    const filteredFromA = await request(app.getHttpServer())
      .get(`/api/v1/activities?opportunityId=${opportunityB.id}`)
      .set("Authorization", `Bearer ${memberA.token}`)
      .expect(200);
    expect(filteredFromA.body.total).toBe(0);
    expect(filteredFromA.body.items).toEqual([]);
  });

  it("rejects a soft-deleted opportunity as a new reference but preserves history", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Boundary Soft Delete", slug: "boundary-soft-delete" },
    });
    const member = await createMember(organization, "ADMIN", "soft-delete");
    const opportunity = await createOpportunity(
      organization.id,
      member.user.id,
      "Historical"
    );

    const linked = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        type: "TASK",
        title: "Historical linked activity",
        ownerUserId: member.user.id,
        opportunityId: opportunity.id,
      })
      .expect(201);

    await prisma.withTenant(organization.id, tenant =>
      tenant.opportunity.update({
        where: { id: opportunity.id },
        data: {
          deletedAt: new Date(),
          deletedBy: member.user.id,
          updatedBy: member.user.id,
        },
      })
    );

    const newReferenceRejected = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        type: "TASK",
        title: "New reference after deletion",
        ownerUserId: member.user.id,
        opportunityId: opportunity.id,
      })
      .expect(404);
    expect(newReferenceRejected.body.code).toBe("ACTIVITY_REFERENCE_NOT_FOUND");

    const historical = await request(app.getHttpServer())
      .get(`/api/v1/activities/${linked.body.id as string}`)
      .set("Authorization", `Bearer ${member.token}`)
      .expect(200);
    expect(historical.body.opportunityId).toBe(opportunity.id);
  });

  it("allows SELLER link writes and blocks VIEWER link writes", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Boundary RBAC", slug: "boundary-rbac" },
    });
    const seller = await createMember(organization, "SELLER", "seller");
    const viewer = await createMember(organization, "VIEWER", "viewer");
    const opportunity = await createOpportunity(
      organization.id,
      seller.user.id,
      "Seller"
    );

    const created = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${seller.token}`)
      .send({
        type: "TASK",
        title: "Seller linked activity",
        ownerUserId: seller.user.id,
        opportunityId: opportunity.id,
      })
      .expect(201);
    expect(created.body.opportunityId).toBe(opportunity.id);

    await request(app.getHttpServer())
      .get(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);

    const viewerRejected = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ opportunityId: null })
      .expect(403);
    expect(viewerRejected.body.code).toBe("ACCESS_DENIED");

    const sellerUpdated = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${created.body.id as string}`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ opportunityId: null })
      .expect(200);
    expect(sellerUpdated.body.opportunityId).toBeNull();
  });
});

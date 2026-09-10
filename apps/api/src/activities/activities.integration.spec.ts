import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 3.5.2 activities API", () => {
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

  it("creates, lists, reads, changes status and soft-deletes an activity with audit", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Activities Organization", slug: "activities-org" },
    });
    const password = "Strong-Activities-Password-2026!";
    const user = await createUser({
      email: "activities-admin@example.test",
      password,
      displayName: "Activities Admin",
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
          legalName: "Cliente Atividades",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const contact = await prisma.withTenant(organization.id, tenant =>
      tenant.contact.create({
        data: {
          organizationId: organization.id,
          fullName: "Contato Atividades",
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
    const dueAt = "2026-09-15T15:00:00.000Z";

    const created = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-5-2-activity-create")
      .send({
        type: "TASK",
        priority: "HIGH",
        title: "Preparar proposta comercial",
        description: "Conferir escopo e valores antes do envio.",
        ownerUserId: user.id,
        companyId: company.id,
        contactId: contact.id,
        dueAt,
      })
      .expect(201);

    const activityId = created.body.id as string;
    expect(created.body).toMatchObject({
      organizationId: organization.id,
      type: "TASK",
      status: "PENDING",
      priority: "HIGH",
      title: "Preparar proposta comercial",
      ownerUserId: user.id,
      companyId: company.id,
      contactId: contact.id,
      completedAt: null,
      cancelledAt: null,
    });

    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/activities?q=proposta&status=PENDING&ownerUserId=${user.id}&page=1&limit=20`
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(activityId);

    await request(app.getHttpServer())
      .get(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-5-2-activity-complete")
      .send({ status: "COMPLETED", title: "Proposta pronta" })
      .expect(200);

    expect(completed.body.status).toBe("COMPLETED");
    expect(completed.body.title).toBe("Proposta pronta");
    expect(completed.body.completedAt).toEqual(expect.any(String));
    expect(completed.body.cancelledAt).toBeNull();

    const cancelled = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-5-2-activity-cancel")
      .send({ status: "CANCELLED" })
      .expect(200);

    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.completedAt).toBeNull();
    expect(cancelled.body.cancelledAt).toEqual(expect.any(String));

    const reopened = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-5-2-activity-reopen")
      .send({ status: "PENDING" })
      .expect(200);

    expect(reopened.body.status).toBe("PENDING");
    expect(reopened.body.completedAt).toBeNull();
    expect(reopened.body.cancelledAt).toBeNull();

    await request(app.getHttpServer())
      .delete(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c3-5-2-activity-delete")
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    const stored = await prisma.withTenant(organization.id, tenant =>
      tenant.activity.findUnique({ where: { id: activityId } })
    );
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(stored?.deletedBy).toBe(user.id);

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        entityId: activityId,
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(auditActions.map(item => item.action)).toEqual([
      "activity.created",
      "activity.completed",
      "activity.cancelled",
      "activity.updated",
      "activity.deleted",
    ]);
  });

  it("hides cross-tenant activities and rejects cross-tenant references and owners", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Activity Org A", slug: "activity-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Activity Org B", slug: "activity-org-b" },
      }),
    ]);
    const password = "Strong-Tenant-Activity-Password-2026!";
    const userA = await createUser({
      email: "activity-a@example.test",
      password,
      displayName: "Activity User A",
    });
    const userB = await createUser({
      email: "activity-b@example.test",
      password,
      displayName: "Activity User B",
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organizationA.id,
          userId: userA.id,
          role: "ADMIN",
        },
        {
          organizationId: organizationB.id,
          userId: userB.id,
          role: "ADMIN",
        },
      ],
    });
    const companyB = await prisma.withTenant(organizationB.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organizationB.id,
          legalName: "Empresa Tenant B",
          createdBy: userB.id,
          updatedBy: userB.id,
        },
      })
    );
    const contactB = await prisma.withTenant(organizationB.id, tenant =>
      tenant.contact.create({
        data: {
          organizationId: organizationB.id,
          fullName: "Contato Tenant B",
          createdBy: userB.id,
          updatedBy: userB.id,
        },
      })
    );
    const activityB = await prisma.withTenant(organizationB.id, tenant =>
      tenant.activity.create({
        data: {
          organizationId: organizationB.id,
          type: "TASK",
          title: "Atividade privada do tenant B",
          ownerUserId: userB.id,
          createdBy: userB.id,
          updatedBy: userB.id,
        },
      })
    );
    const tokenA = await login({
      email: userA.email,
      password,
      organizationSlug: organizationA.slug,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/activities/${activityB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activityB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "Tentativa cruzada" })
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "TASK",
        title: "Referência de outro tenant",
        ownerUserId: userA.id,
        companyId: companyB.id,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "TASK",
        title: "Contato de outro tenant",
        ownerUserId: userA.id,
        contactId: contactB.id,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "TASK",
        title: "Responsável sem membership",
        ownerUserId: userB.id,
      })
      .expect(404);

    const untouched = await prisma.withTenant(organizationB.id, tenant =>
      tenant.activity.findUnique({ where: { id: activityB.id } })
    );
    expect(untouched?.title).toBe("Atividade privada do tenant B");
  });

  it("allows SELLER writes and blocks VIEWER writes while preserving read access", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Activity RBAC Org", slug: "activity-rbac-org" },
    });
    const password = "Strong-Activity-Rbac-Password-2026!";
    const seller = await createUser({
      email: "activity-seller@example.test",
      password,
      displayName: "Activity Seller",
    });
    const viewer = await createUser({
      email: "activity-viewer@example.test",
      password,
      displayName: "Activity Viewer",
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organization.id,
          userId: seller.id,
          role: "SELLER",
        },
        {
          organizationId: organization.id,
          userId: viewer.id,
          role: "VIEWER",
        },
      ],
    });
    const sellerToken = await login({
      email: seller.email,
      password,
      organizationSlug: organization.slug,
    });
    const viewerToken = await login({
      email: viewer.email,
      password,
      organizationSlug: organization.slug,
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        type: "APPOINTMENT",
        title: "Reunião comercial",
        ownerUserId: seller.id,
      })
      .expect(201);

    const activityId = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        type: "TASK",
        title: "Não autorizado",
        ownerUserId: viewer.id,
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ title: "Não autorizado" })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/activities/${activityId}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403);
  });
});

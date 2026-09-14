import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Issue #40 — audit completeness", () => {
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
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE
         audit_logs,
         refresh_sessions,
         organization_memberships,
         users,
         organizations
       CASCADE`
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAdminSession(input: {
    organizationName: string;
    organizationSlug: string;
    email: string;
  }) {
    const organization = await prisma.organization.create({
      data: {
        name: input.organizationName,
        slug: input.organizationSlug,
      },
    });
    const password = "Strong-Audit-Password-2026!";
    const user = await prisma.user.create({
      data: {
        email: input.email,
        emailNormalized: input.email,
        displayName: `${input.organizationName} Admin`,
        passwordHash: await passwords.hash(password),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: user.email,
        password,
        organizationSlug: organization.slug,
      })
      .expect(200);

    return {
      organization,
      user,
      token: login.body.accessToken as string,
    };
  }

  it("records company create, update and delete with canonical before/after context", async () => {
    const { organization, user, token } = await createAdminSession({
      organizationName: "Audit Completeness",
      organizationSlug: "audit-completeness",
      email: "audit-completeness@example.test",
    });

    const createRequestId = "audit-company-create-001";
    const updateRequestId = "audit-company-update-001";
    const deleteRequestId = "audit-company-delete-001";

    const created = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", createRequestId)
      .send({ legalName: "Canonical Audit Company" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", updateRequestId)
      .send({ legalName: "Canonical Audit Company Updated" })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/companies/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", deleteRequestId)
      .expect(204);

    const audit = await request(app.getHttpServer())
      .get("/api/v1/admin/audit?limit=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const items = audit.body.items as Array<Record<string, unknown>>;
    const createLog = items.find(log => log.requestId === createRequestId);
    const updateLog = items.find(log => log.requestId === updateRequestId);
    const deleteLog = items.find(log => log.requestId === deleteRequestId);

    expect(createLog).toMatchObject({
      organizationId: organization.id,
      actorUserId: user.id,
      requestId: createRequestId,
      action: "company.created",
      entityType: "company",
      entityId: created.body.id,
      after: expect.objectContaining({
        legalName: "Canonical Audit Company",
        version: 1,
      }),
      ipAddress: expect.any(String),
    });

    expect(updateLog).toMatchObject({
      organizationId: organization.id,
      actorUserId: user.id,
      requestId: updateRequestId,
      action: "company.updated",
      entityType: "company",
      entityId: created.body.id,
      before: expect.objectContaining({
        legalName: "Canonical Audit Company",
        version: 1,
      }),
      after: expect.objectContaining({
        legalName: "Canonical Audit Company Updated",
        version: 2,
      }),
    });

    expect(deleteLog).toMatchObject({
      organizationId: organization.id,
      actorUserId: user.id,
      requestId: deleteRequestId,
      action: "company.deleted",
      entityType: "company",
      entityId: created.body.id,
      before: expect.objectContaining({
        legalName: "Canonical Audit Company Updated",
        version: 2,
      }),
      after: expect.objectContaining({
        legalName: "Canonical Audit Company Updated",
        version: 3,
        deletedBy: user.id,
        deletedAt: expect.any(String),
      }),
    });
  });

  it("keeps audit listing isolated between tenants", async () => {
    const tenantA = await createAdminSession({
      organizationName: "Audit Tenant A",
      organizationSlug: "audit-tenant-a",
      email: "audit-tenant-a@example.test",
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .set("x-request-id", "audit-tenant-a-company")
      .send({ legalName: "Tenant A Secret Company" })
      .expect(201);

    const tenantB = await createAdminSession({
      organizationName: "Audit Tenant B",
      organizationSlug: "audit-tenant-b",
      email: "audit-tenant-b@example.test",
    });

    const auditB = await request(app.getHttpServer())
      .get("/api/v1/admin/audit?limit=100")
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(200);

    expect(auditB.body.items).not.toContainEqual(
      expect.objectContaining({
        organizationId: tenantA.organization.id,
        entityId: created.body.id,
      })
    );
  });
});

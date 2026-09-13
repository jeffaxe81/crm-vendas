import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Issue #40 — advanced security audit", () => {
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

  async function createViewerSession() {
    const organization = await prisma.organization.create({
      data: {
        name: "Issue 40 Viewer",
        slug: "issue-40-viewer",
      },
    });
    const password = "Strong-Issue-40-Password-2026!";
    const user = await prisma.user.create({
      data: {
        email: "issue-40-viewer@example.test",
        emailNormalized: "issue-40-viewer@example.test",
        displayName: "Issue 40 Viewer",
        passwordHash: await passwords.hash(password),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "VIEWER",
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

  async function findDeniedAccessAudit(organizationId: string, requestId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const log = await prisma.withTenant(organizationId, tenant =>
        tenant.auditLog.findFirst({
          where: {
            organizationId,
            requestId,
            action: "access_denied",
            entityType: "security",
          },
        })
      );

      if (log) {
        return log;
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return null;
  }

  it("audits an authenticated 403 permission denial with tenant context", async () => {
    const { organization, user, token } = await createViewerSession();
    const requestId = "issue-40-permission-denied";

    await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", requestId)
      .send({ legalName: "Viewer must not create" })
      .expect(403);

    const log = await findDeniedAccessAudit(organization.id, requestId);

    expect(log).toMatchObject({
      organizationId: organization.id,
      actorUserId: user.id,
      requestId,
      action: "access_denied",
      entityType: "security",
      metadata: expect.objectContaining({
        endpoint: "/api/v1/companies",
        method: "POST",
        httpStatus: 403,
      }),
    });
  });
});

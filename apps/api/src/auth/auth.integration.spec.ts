import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "./password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 1 authentication and tenant isolation", () => {
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
      'TRUNCATE TABLE "audit_logs", "refresh_sessions", "organization_memberships", "users", "organizations" CASCADE'
    );
  }

  it("isolates organizations and invalidates disabled or logged-out sessions", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Organization A", slug: "organization-a" },
      }),
      prisma.organization.create({
        data: { name: "Organization B", slug: "organization-b" },
      }),
    ]);

    const password = "Strong-Test-Password-2026!";
    const user = await prisma.user.create({
      data: {
        email: "admin@example.test",
        emailNormalized: "admin@example.test",
        displayName: "Admin Test",
        passwordHash: await passwords.hash(password),
      },
    });

    const membershipA = await prisma.organizationMembership.create({
      data: {
        organizationId: organizationA.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organizationB.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("x-request-id", "cycle1-login-a")
      .send({
        email: user.email,
        password,
        organizationSlug: organizationA.slug,
      })
      .expect(200);

    expect(loginA.body.organization.id).toBe(organizationA.id);
    expect(loginA.body.membership.id).toBe(membershipA.id);
    expect(loginA.body.permissions).toContain("user.manage");

    const setCookie = loginA.headers["set-cookie"];
    expect(Array.isArray(setCookie)).toBe(true);
    const refreshCookie = setCookie[0].split(";")[0];
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("SameSite=Strict");

    const accessTokenA = loginA.body.accessToken as string;

    const meA = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .expect(200);

    expect(meA.body.organizationId).toBe(organizationA.id);

    const usersA = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .expect(200);

    expect(usersA.body).toHaveLength(1);
    expect(usersA.body[0].membershipId).toBe(membershipA.id);

    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("x-request-id", "cycle1-login-b")
      .send({
        email: user.email,
        password,
        organizationSlug: organizationB.slug,
      })
      .expect(200);

    expect(loginB.body.organization.id).toBe(organizationB.id);

    await prisma.organizationMembership.update({
      where: { id: membershipA.id },
      data: { isActive: false },
    });

    const disabledAccess = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .expect(401);

    expect(disabledAccess.body.code).toBe("AUTHENTICATION_REQUIRED");

    await prisma.organizationMembership.update({
      where: { id: membershipA.id },
      data: { isActive: true },
    });

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .set("x-request-id", "cycle1-logout-a")
      .expect(204);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .expect(401);

    const auditA = await prisma.auditLog.findMany({
      where: { organizationId: organizationA.id },
      orderBy: { createdAt: "asc" },
    });

    expect(auditA.map(item => item.action)).toEqual(
      expect.arrayContaining(["auth.login", "auth.logout"])
    );

    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "audit_logs" WHERE "organization_id" = '${organizationA.id}'::uuid`
      )
    ).rejects.toThrow("audit_logs is append-only");
  });
});

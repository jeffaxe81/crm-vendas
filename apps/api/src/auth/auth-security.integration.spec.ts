import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { PasswordService } from "./password.service";

describe("Cycle 1 authentication security controls", () => {
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
      'TRUNCATE TABLE "audit_logs", "refresh_sessions", "organization_memberships", "users", "organizations" CASCADE'
    );
  }

  async function createIdentity(role: "ADMIN" | "VIEWER") {
    const organization = await prisma.organization.create({
      data: {
        name: `${role} Organization`,
        slug: `${role.toLowerCase()}-organization`,
      },
    });
    const password = "Strong-Security-Password-2026!";
    const email = `${role.toLowerCase()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `${role} User`,
        passwordHash: await passwords.hash(password),
      },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role,
      },
    });

    return { organization, user, membership, password };
  }

  it("denies user administration to a VIEWER membership", async () => {
    const { organization, user, password } = await createIdentity("VIEWER");

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: user.email,
        password,
        organizationSlug: organization.slug,
      })
      .expect(200);

    expect(login.body.permissions).not.toContain("user.manage");

    await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${login.body.accessToken as string}`)
      .expect(403);
  });

  it("rejects login and refresh after the user is disabled without auditing secrets", async () => {
    const { organization, user, password } = await createIdentity("ADMIN");

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: user.email,
        password,
        organizationSlug: organization.slug,
      })
      .expect(200);

    const cookies = login.headers["set-cookie"];
    if (!Array.isArray(cookies) || !cookies[0]) {
      throw new Error("Expected refresh cookie after login.");
    }
    const refreshCookie = cookies[0].split(";")[0];
    if (!refreshCookie) {
      throw new Error("Expected refresh cookie value.");
    }

    const session = await prisma.refreshSession.findFirst({
      where: {
        organizationId: organization.id,
        userId: user.id,
      },
    });
    if (!session) {
      throw new Error("Expected persisted refresh session after login.");
    }

    const loginAudit = await prisma.auditLog.findMany({
      where: { organizationId: organization.id },
    });
    const serializedAudit = JSON.stringify(loginAudit);
    expect(serializedAudit).not.toContain(password);
    expect(serializedAudit).not.toContain(session.tokenHash);

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: user.email,
        password,
        organizationSlug: organization.slug,
      })
      .expect(401);
  });
});

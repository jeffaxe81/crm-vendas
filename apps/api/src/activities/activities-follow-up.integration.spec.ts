import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 4 explicit follow-up API", () => {
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
         activities,
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

  it("creates and lists FOLLOW_UP inside the active tenant", async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Follow-up Organization",
        slug: "follow-up-org",
      },
    });
    const password = "C4-Follow-Up-Test-Password-2026!";
    const user = await prisma.user.create({
      data: {
        email: "follow-up-admin@example.test",
        emailNormalized: "follow-up-admin@example.test",
        displayName: "Follow-up Admin",
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

    const token = login.body.accessToken as string;
    const dueAt = "2026-11-01T12:00:00.000Z";

    const created = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "FOLLOW_UP",
        priority: "HIGH",
        title: "Retornar proposta",
        ownerUserId: user.id,
        dueAt,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      organizationId: organization.id,
      type: "FOLLOW_UP",
      status: "PENDING",
      title: "Retornar proposta",
    });

    const listed = await request(app.getHttpServer())
      .get("/api/v1/activities?type=FOLLOW_UP&status=PENDING&page=1&limit=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(listed.body.total).toBe(1);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      id: created.body.id,
      type: "FOLLOW_UP",
      title: "Retornar proposta",
    });
  });
});

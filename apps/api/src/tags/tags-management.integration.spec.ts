import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 2 tag management API", () => {
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

  it("lists and updates tags in the active organization while keeping VIEWER read-only", async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Tag Management Organization",
        slug: "tag-management",
      },
    });
    const admin = await createUser({
      email: "tag-management-admin@example.test",
      password: "Strong-Tag-Management-Admin-2026!",
      displayName: "Tag Management Admin",
    });
    const viewer = await createUser({
      email: "tag-management-viewer@example.test",
      password: "Strong-Tag-Management-Viewer-2026!",
      displayName: "Tag Management Viewer",
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organization.id,
          userId: admin.id,
          role: "ADMIN",
        },
        {
          organizationId: organization.id,
          userId: viewer.id,
          role: "VIEWER",
        },
      ],
    });

    const tag = await prisma.tag.create({
      data: {
        organizationId: organization.id,
        name: "Inicial",
        normalizedName: "inicial",
      },
    });

    const adminToken = await login({
      email: admin.email,
      password: "Strong-Tag-Management-Admin-2026!",
      organizationSlug: organization.slug,
    });
    const viewerToken = await login({
      email: viewer.email,
      password: "Strong-Tag-Management-Viewer-2026!",
      organizationSlug: organization.slug,
    });

    const viewerList = await request(app.getHttpServer())
      .get("/api/v1/tags?page=1&limit=20")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(200);

    expect(viewerList.body).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
    });
    expect(viewerList.body.items).toHaveLength(1);

    await request(app.getHttpServer())
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Viewer não pode criar" })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/tags/${tag.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-request-id", "cycle2-tag-update")
      .send({ name: "  Estratégica  " })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: tag.id,
      name: "Estratégica",
      normalizedName: "estratégica",
    });

    const filtered = await request(app.getHttpServer())
      .get("/api/v1/tags?page=1&limit=20&q=estratégica")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0]).toMatchObject({ id: tag.id });

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        action: "tag.updated",
        entityId: tag.id,
      },
    });
    expect(audit).toHaveLength(1);
  });
});

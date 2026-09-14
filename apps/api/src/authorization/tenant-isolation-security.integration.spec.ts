import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Issue #40 — tenant isolation security", () => {
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
    const password = "Strong-Tenant-Isolation-2026!";
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

  it("returns not found when another tenant reads, updates or deletes a company", async () => {
    const tenantA = await createAdminSession({
      organizationName: "Isolation Tenant A",
      organizationSlug: "isolation-tenant-a",
      email: "isolation-tenant-a@example.test",
    });
    const tenantB = await createAdminSession({
      organizationName: "Isolation Tenant B",
      organizationSlug: "isolation-tenant-b",
      email: "isolation-tenant-b@example.test",
    });

    const company = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ legalName: "Tenant A Company" })
      .expect(201);

    const read = await request(app.getHttpServer())
      .get(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);
    expect(read.body.code).toBe("COMPANY_NOT_FOUND");

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .send({ legalName: "Cross Tenant Mutation" })
      .expect(404);
    expect(update.body.code).toBe("COMPANY_NOT_FOUND");

    const remove = await request(app.getHttpServer())
      .delete(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);
    expect(remove.body.code).toBe("COMPANY_NOT_FOUND");

    const stillVisibleToOwner = await request(app.getHttpServer())
      .get(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(stillVisibleToOwner.body.legalName).toBe("Tenant A Company");
  });

  it("prevents cross-tenant unlink and keeps soft-deleted entities invisible", async () => {
    const tenantA = await createAdminSession({
      organizationName: "Relationship Tenant A",
      organizationSlug: "relationship-tenant-a",
      email: "relationship-tenant-a@example.test",
    });
    const tenantB = await createAdminSession({
      organizationName: "Relationship Tenant B",
      organizationSlug: "relationship-tenant-b",
      email: "relationship-tenant-b@example.test",
    });

    const company = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ legalName: "Relationship Company A" })
      .expect(201);

    const contact = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ fullName: "Relationship Contact A" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/companies/${company.body.id}/contacts/${contact.body.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ isPrimary: true, relationshipLabel: "Decision maker" })
      .expect(201);

    const unlink = await request(app.getHttpServer())
      .delete(
        `/api/v1/companies/${company.body.id}/contacts/${contact.body.id}`
      )
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);
    expect(unlink.body.code).toBe("COMPANY_CONTACT_NOT_FOUND");

    await request(app.getHttpServer())
      .delete(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(204);

    const ownerReadAfterDelete = await request(app.getHttpServer())
      .get(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(404);
    expect(ownerReadAfterDelete.body.code).toBe("COMPANY_NOT_FOUND");

    const otherTenantReadAfterDelete = await request(app.getHttpServer())
      .get(`/api/v1/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);
    expect(otherTenantReadAfterDelete.body.code).toBe("COMPANY_NOT_FOUND");
  });
});

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 2 companies API", () => {
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

  it("lists and reads only companies from the authenticated organization", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Organization A", slug: "company-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Organization B", slug: "company-org-b" },
      }),
    ]);
    const password = "Strong-Company-Password-2026!";
    const user = await createUser({
      email: "companies-admin@example.test",
      password,
      displayName: "Companies Admin",
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organizationA.id,
          userId: user.id,
          role: "ADMIN",
        },
        {
          organizationId: organizationB.id,
          userId: user.id,
          role: "ADMIN",
        },
      ],
    });

    const companyA = await prisma.withTenant(organizationA.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organizationA.id,
          legalName: "Empresa Alpha",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const companyB = await prisma.withTenant(organizationB.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organizationB.id,
          legalName: "Empresa Beta",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    const list = await request(app.getHttpServer())
      .get("/api/v1/companies?q=Empresa&page=1&limit=20")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(list.body).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
    });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: companyA.id,
      legalName: "Empresa Alpha",
    });

    await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyA.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ legalName: "Tentativa cruzada" })
      .expect(404);

    const untouchedCompanyB = await prisma.withTenant(
      organizationB.id,
      tenant => tenant.company.findUnique({ where: { id: companyB.id } })
    );
    expect(untouchedCompanyB?.legalName).toBe("Empresa Beta");
  });

  it("blocks company writes for VIEWER memberships", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Viewer Organization", slug: "company-viewer-org" },
    });
    const password = "Strong-Viewer-Password-2026!";
    const user = await createUser({
      email: "company-viewer@example.test",
      password,
      displayName: "Company Viewer",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "VIEWER",
      },
    });
    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });

    await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${token}`)
      .send({ legalName: "Empresa não autorizada" })
      .expect(403);
  });

  it("creates, updates and soft-deletes a company with audit records", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Lifecycle Organization", slug: "company-lifecycle-org" },
    });
    const password = "Strong-Lifecycle-Password-2026!";
    const user = await createUser({
      email: "company-lifecycle@example.test",
      password,
      displayName: "Lifecycle Admin",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });
    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-company-create")
      .send({
        legalName: "Empresa Criada",
        tradeName: "Criada",
        document: "DOC-001",
      })
      .expect(201);

    const companyId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-company-update")
      .send({ tradeName: "Criada Atualizada" })
      .expect(200);

    expect(updated.body.tradeName).toBe("Criada Atualizada");

    await request(app.getHttpServer())
      .delete(`/api/v1/companies/${companyId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-company-delete")
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    const stored = await prisma.withTenant(organization.id, tenant =>
      tenant.company.findUnique({ where: { id: companyId } })
    );
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(stored?.deletedBy).toBe(user.id);

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        entityId: companyId,
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(auditActions.map(item => item.action)).toEqual([
      "company.created",
      "company.updated",
      "company.deleted",
    ]);
  });
});

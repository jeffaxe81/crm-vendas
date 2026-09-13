import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.2.1 company import API", () => {
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

  async function createUser(email: string, password: string) {
    return prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        displayName: email.split("@")[0] ?? "Import User",
        passwordHash: await passwords.hash(password),
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

  async function createSession(role: "ADMIN" | "VIEWER", suffix: string) {
    const organization = await prisma.organization.create({
      data: { name: `Import ${suffix}`, slug: `import-${suffix}` },
    });
    const password = "Strong-Import-Password-2026!";
    const user = await createUser(`import-${suffix}@example.test`, password);
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });
    return { organization, user, token };
  }

  it("blocks preview for VIEWER memberships", async () => {
    const { token } = await createSession("VIEWER", "viewer");

    await request(app.getHttpServer())
      .post("/api/v1/company-imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("legalName\nEmpresa Viewer"), "empresas.csv")
      .expect(403);
  });

  it("previews without persistence and keeps duplicate checks tenant-isolated", async () => {
    const tenantA = await createSession("ADMIN", "tenant-a");
    const tenantB = await createSession("ADMIN", "tenant-b");

    await prisma.withTenant(tenantB.organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: tenantB.organization.id,
          legalName: "Empresa do Tenant B",
          document: "DOC-SHARED",
          createdBy: tenantB.user.id,
          updatedBy: tenantB.user.id,
        },
      })
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/company-imports/preview")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .attach(
        "file",
        Buffer.from("legalName,document\nEmpresa do Tenant A,DOC-SHARED"),
        "empresas.csv"
      )
      .expect(200);

    expect(response.body).toMatchObject({ processed: 1, valid: 1, invalid: 0 });
    expect(response.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const companiesA = await prisma.withTenant(
      tenantA.organization.id,
      tenant =>
        tenant.company.count({
          where: { organizationId: tenantA.organization.id },
        })
    );
    expect(companiesA).toBe(0);
  });

  it("normalizes surrounding whitespace when checking existing documents", async () => {
    const { organization, user, token } = await createSession(
      "ADMIN",
      "trim-duplicate"
    );

    await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Empresa Legada",
          document: " DOC-LEGACY ",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/company-imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach(
        "file",
        Buffer.from("legalName,document\nEmpresa Nova,doc-legacy"),
        "empresas.csv"
      )
      .expect(200);

    expect(response.body).toMatchObject({ processed: 1, valid: 0, invalid: 1 });
    expect(response.body.rows[0]?.errors).toContain(
      "Documento já cadastrado para outra empresa."
    );
  });

  it("confirms valid rows, rejects invalid rows and audits created companies", async () => {
    const { organization, token } = await createSession("ADMIN", "confirm");
    const csv = Buffer.from(
      "legalName,document,website\nEmpresa Valida,DOC-OK,https://valida.example\nEmpresa Invalida,DOC-BAD,nao-e-url"
    );

    const preview = await request(app.getHttpServer())
      .post("/api/v1/company-imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv, "empresas.csv")
      .expect(200);

    const result = await request(app.getHttpServer())
      .post("/api/v1/company-imports/confirm")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c4-2-1-import-confirm")
      .field("fingerprint", preview.body.fingerprint as string)
      .attach("file", csv, "empresas.csv")
      .expect(200);

    expect(result.body).toMatchObject({
      processed: 2,
      imported: 1,
      rejected: 1,
    });

    const companies = await prisma.withTenant(organization.id, tenant =>
      tenant.company.findMany({ where: { organizationId: organization.id } })
    );
    expect(companies).toHaveLength(1);
    expect(companies[0]?.legalName).toBe("Empresa Valida");

    const audit = await prisma.withTenant(organization.id, tenant =>
      tenant.auditLog.findMany({
        where: { organizationId: organization.id, action: "company.created" },
        select: { requestId: true, entityId: true },
      })
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.requestId).toBe("c4-2-1-import-confirm");
  });

  it("returns 400 for invalid CSV and a mismatched fingerprint", async () => {
    const { token } = await createSession("ADMIN", "validation");

    await request(app.getHttpServer())
      .post("/api/v1/company-imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach(
        "file",
        Buffer.from("legalName,unknown\nEmpresa A,x"),
        "empresas.csv"
      )
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/v1/company-imports/confirm")
      .set("Authorization", `Bearer ${token}`)
      .field("fingerprint", "0".repeat(64))
      .attach("file", Buffer.from("legalName\nEmpresa A"), "empresas.csv")
      .expect(400);
  });
});

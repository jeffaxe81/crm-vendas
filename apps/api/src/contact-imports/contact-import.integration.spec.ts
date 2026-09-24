import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.2.2 contact import API", () => {
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

  const url = (path: "preview" | "confirm") =>
    `/api/v1/contact-imports/${path}`;

  async function contactCount(organizationId: string) {
    return prisma.withTenant(organizationId, tenant =>
      tenant.contact.count({ where: { organizationId } })
    );
  }

  it("blocks preview for VIEWER memberships", async () => {
    const { token } = await createSession("VIEWER", "viewer");

    await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fullName\nContato Viewer"), "contatos.csv")
      .expect(403);
  });

  it("previews without persistence and keeps e-mail checks tenant-isolated", async () => {
    const tenantA = await createSession("ADMIN", "tenant-a");
    const tenantB = await createSession("ADMIN", "tenant-b");

    await prisma.withTenant(tenantB.organization.id, async tenant => {
      const contact = await tenant.contact.create({
        data: {
          organizationId: tenantB.organization.id,
          fullName: "Contato do Tenant B",
          createdBy: tenantB.user.id,
          updatedBy: tenantB.user.id,
        },
      });
      await tenant.contactChannel.create({
        data: {
          organizationId: tenantB.organization.id,
          contactId: contact.id,
          type: "EMAIL",
          value: "shared@example.test",
          isPrimary: true,
        },
      });
    });

    const response = await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${tenantA.token}`)
      .attach(
        "file",
        Buffer.from("fullName,email\nContato A,shared@example.test"),
        "contatos.csv"
      )
      .expect(200);

    expect(response.body).toMatchObject({ processed: 1, valid: 1, invalid: 0 });
    expect(response.body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await contactCount(tenantA.organization.id)).toBe(0);
  });

  it("detects e-mails already registered in the same tenant, ignoring case and spaces", async () => {
    const { organization, user, token } = await createSession(
      "ADMIN",
      "existing-email"
    );

    await prisma.withTenant(organization.id, async tenant => {
      const contact = await tenant.contact.create({
        data: {
          organizationId: organization.id,
          fullName: "Contato Legado",
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      await tenant.contactChannel.create({
        data: {
          organizationId: organization.id,
          contactId: contact.id,
          type: "EMAIL",
          value: " Legado@Example.test ",
          isPrimary: true,
        },
      });
    });

    const response = await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .attach(
        "file",
        Buffer.from("fullName,email\nNovo,legado@example.test"),
        "contatos.csv"
      )
      .expect(200);

    expect(response.body).toMatchObject({ processed: 1, valid: 0, invalid: 1 });
    expect(response.body.rows[0]?.errors).toContain(
      "E-mail já cadastrado para outro contato."
    );
  });

  it("confirms valid rows with channels, rejects invalid rows and audits", async () => {
    const { organization, token } = await createSession("ADMIN", "confirm");
    const csv = Buffer.from(
      "fullName,jobTitle,email,mobile\nAna Souza,Compradora,ana@example.test,48999990000\nSem Email Valido,,nao-e-email,"
    );

    const preview = await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", csv, "contatos.csv")
      .expect(200);

    const result = await request(app.getHttpServer())
      .post(url("confirm"))
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c4-2-2-import-confirm")
      .field("fingerprint", preview.body.fingerprint as string)
      .attach("file", csv, "contatos.csv")
      .expect(200);

    expect(result.body).toMatchObject({
      processed: 2,
      imported: 1,
      rejected: 1,
    });

    const contacts = await prisma.withTenant(organization.id, tenant =>
      tenant.contact.findMany({
        where: { organizationId: organization.id },
        include: { channels: { orderBy: { type: "asc" } } },
      })
    );
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      fullName: "Ana Souza",
      jobTitle: "Compradora",
    });
    expect(
      contacts[0]?.channels.map(channel => [
        channel.type,
        channel.value,
        channel.isPrimary,
      ])
    ).toEqual([
      ["EMAIL", "ana@example.test", true],
      ["MOBILE", "48999990000", true],
    ]);

    const audit = await prisma.withTenant(organization.id, tenant =>
      tenant.auditLog.findMany({
        where: { organizationId: organization.id },
        select: { action: true, requestId: true },
        orderBy: { createdAt: "asc" },
      })
    );
    const importAudit = audit.filter(
      entry => entry.requestId === "c4-2-2-import-confirm"
    );
    expect(importAudit.map(entry => entry.action).sort()).toEqual([
      "contact.channel_created",
      "contact.channel_created",
      "contact.created",
    ]);
  });

  it("returns 400 for invalid CSV, missing file, non-CSV file and mismatched fingerprint", async () => {
    const { token } = await createSession("ADMIN", "validation");

    await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fullName,unknown\nAna,x"), "contatos.csv")
      .expect(400);

    await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .post(url("preview"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fullName\nAna"), "contatos.txt")
      .expect(400);

    await request(app.getHttpServer())
      .post(url("confirm"))
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fullName\nAna"), "contatos.csv")
      .expect(400);

    await request(app.getHttpServer())
      .post(url("confirm"))
      .set("Authorization", `Bearer ${token}`)
      .field("fingerprint", "0".repeat(64))
      .attach("file", Buffer.from("fullName\nAna"), "contatos.csv")
      .expect(400);
  });
});

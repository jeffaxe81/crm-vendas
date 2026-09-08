import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 2 company-contact relationships and history API", () => {
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

  async function createOrganizationAdmin(input: {
    organizationName: string;
    organizationSlug: string;
    email: string;
    password: string;
  }) {
    const organization = await prisma.organization.create({
      data: {
        name: input.organizationName,
        slug: input.organizationSlug,
      },
    });
    const user = await createUser({
      email: input.email,
      password: input.password,
      displayName: `${input.organizationName} Admin`,
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const token = await login({
      email: input.email,
      password: input.password,
      organizationSlug: input.organizationSlug,
    });

    return { organization, user, token };
  }

  it("rejects a company-contact link when the contact belongs to another organization", async () => {
    const password = "Strong-Relationship-Password-2026!";
    const organizationA = await prisma.organization.create({
      data: { name: "Relationship Organization A", slug: "relationship-org-a" },
    });
    const organizationB = await prisma.organization.create({
      data: { name: "Relationship Organization B", slug: "relationship-org-b" },
    });
    const user = await createUser({
      email: "relationship-admin@example.test",
      password,
      displayName: "Relationship Admin",
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

    const companyA = await prisma.company.create({
      data: {
        organizationId: organizationA.id,
        legalName: "Empresa A",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const contactB = await prisma.contact.create({
      data: {
        organizationId: organizationB.id,
        fullName: "Contato B",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyA.id}/contacts/${contactB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ relationshipLabel: "Decisor", isPrimary: true })
      .expect(404);

    expect(await prisma.companyContact.count()).toBe(0);
  });

  it("links and unlinks a company and contact in the same organization with audit records", async () => {
    const { organization, user, token } = await createOrganizationAdmin({
      organizationName: "Relationship Lifecycle",
      organizationSlug: "relationship-lifecycle",
      email: "relationship-lifecycle@example.test",
      password: "Strong-Relationship-Lifecycle-2026!",
    });

    const [company, contact] = await Promise.all([
      prisma.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Empresa Relacionada",
          createdBy: user.id,
          updatedBy: user.id,
        },
      }),
      prisma.contact.create({
        data: {
          organizationId: organization.id,
          fullName: "Contato Relacionado",
          createdBy: user.id,
          updatedBy: user.id,
        },
      }),
    ]);

    const linked = await request(app.getHttpServer())
      .post(`/api/v1/companies/${company.id}/contacts/${contact.id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-company-contact-link")
      .send({ relationshipLabel: "Decisor", isPrimary: true })
      .expect(201);

    expect(linked.body).toMatchObject({
      companyId: company.id,
      contactId: contact.id,
      relationshipLabel: "Decisor",
      isPrimary: true,
    });
    expect(
      await prisma.companyContact.count({
        where: { organizationId: organization.id },
      })
    ).toBe(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/companies/${company.id}/contacts/${contact.id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-company-contact-unlink")
      .expect(204);

    expect(
      await prisma.companyContact.count({
        where: { organizationId: organization.id },
      })
    ).toBe(0);

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        entityType: "company_contact",
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(audit.map(item => item.action)).toEqual([
      "company.contact_linked",
      "company.contact_unlinked",
    ]);
  });

  it("creates company-only and contact-only history, lists only the active organization, and rejects history without a target", async () => {
    const { organization, user, token } = await createOrganizationAdmin({
      organizationName: "Relationship History",
      organizationSlug: "relationship-history",
      email: "relationship-history@example.test",
      password: "Strong-Relationship-History-2026!",
    });
    const other = await prisma.organization.create({
      data: { name: "Other History Organization", slug: "other-history-org" },
    });

    const [company, contact] = await Promise.all([
      prisma.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Empresa Histórico",
          createdBy: user.id,
          updatedBy: user.id,
        },
      }),
      prisma.contact.create({
        data: {
          organizationId: organization.id,
          fullName: "Contato Histórico",
          createdBy: user.id,
          updatedBy: user.id,
        },
      }),
    ]);

    const companyEntry = await request(app.getHttpServer())
      .post("/api/v1/relationship-entries")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-history-company")
      .send({
        companyId: company.id,
        kind: "NOTE",
        content: "Histórico apenas da empresa",
        occurredAt: "2026-09-06T18:00:00-03:00",
      })
      .expect(201);

    expect(companyEntry.body).toMatchObject({
      companyId: company.id,
      contactId: null,
      kind: "NOTE",
      content: "Histórico apenas da empresa",
    });

    const contactEntry = await request(app.getHttpServer())
      .post("/api/v1/relationship-entries")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-history-contact")
      .send({
        contactId: contact.id,
        kind: "CALL_NOTE",
        content: "Ligação registrada no contato",
        occurredAt: "2026-09-06T19:00:00-03:00",
      })
      .expect(201);

    expect(contactEntry.body).toMatchObject({
      companyId: null,
      contactId: contact.id,
      kind: "CALL_NOTE",
    });

    await request(app.getHttpServer())
      .post("/api/v1/relationship-entries")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "NOTE",
        content: "Sem empresa e sem contato",
        occurredAt: "2026-09-06T20:00:00-03:00",
      })
      .expect(400);

    const otherCompany = await prisma.company.create({
      data: {
        organizationId: other.id,
        legalName: "Empresa de Outra Organização",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    await prisma.relationshipEntry.create({
      data: {
        organizationId: other.id,
        authorUserId: user.id,
        companyId: otherCompany.id,
        kind: "OTHER",
        content: "Registro de outra organização",
        occurredAt: new Date("2026-09-06T21:00:00-03:00"),
      },
    });

    const list = await request(app.getHttpServer())
      .get("/api/v1/relationship-entries?page=1&limit=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([companyEntry.body.id, contactEntry.body.id])
    );

    const relationshipAudit = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        action: "relationship.created",
      },
    });
    expect(relationshipAudit).toHaveLength(2);
  });

  it("rejects history that references a deleted or cross-organization entity", async () => {
    const password = "Strong-Relationship-Adversarial-2026!";
    const organizationA = await prisma.organization.create({
      data: { name: "History Organization A", slug: "history-org-a" },
    });
    const organizationB = await prisma.organization.create({
      data: { name: "History Organization B", slug: "history-org-b" },
    });
    const user = await createUser({
      email: "relationship-adversarial@example.test",
      password,
      displayName: "Relationship Adversarial Admin",
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

    const deletedCompany = await prisma.company.create({
      data: {
        organizationId: organizationA.id,
        legalName: "Empresa Excluída",
        createdBy: user.id,
        updatedBy: user.id,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    });
    const otherContact = await prisma.contact.create({
      data: {
        organizationId: organizationB.id,
        fullName: "Contato de Outra Organização",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    await request(app.getHttpServer())
      .post("/api/v1/relationship-entries")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        companyId: deletedCompany.id,
        kind: "NOTE",
        content: "Não deve aceitar empresa excluída",
        occurredAt: "2026-09-06T21:30:00-03:00",
      })
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/v1/relationship-entries")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        contactId: otherContact.id,
        kind: "NOTE",
        content: "Não deve aceitar contato de outro tenant",
        occurredAt: "2026-09-06T22:00:00-03:00",
      })
      .expect(404);

    expect(
      await prisma.relationshipEntry.count({
        where: { organizationId: organizationA.id },
      })
    ).toBe(0);
  });
});

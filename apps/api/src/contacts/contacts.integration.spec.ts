import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 2 contacts API", () => {
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

  it("creates a contact without company and isolates reads and writes by organization", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Contact Organization A", slug: "contact-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Contact Organization B", slug: "contact-org-b" },
      }),
    ]);
    const password = "Strong-Contact-Password-2026!";
    const user = await createUser({
      email: "contacts-admin@example.test",
      password,
      displayName: "Contacts Admin",
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

    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ fullName: "Contato sem empresa" })
      .expect(201);

    expect(created.body).toMatchObject({
      fullName: "Contato sem empresa",
      jobTitle: null,
    });

    const contactB = await prisma.contact.create({
      data: {
        organizationId: organizationB.id,
        fullName: "Contato Organização B",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const list = await request(app.getHttpServer())
      .get("/api/v1/contacts?q=Contato&page=1&limit=20")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(list.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(created.body.id);

    await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ fullName: "Tentativa cruzada" })
      .expect(404);

    const untouched = await prisma.contact.findUnique({
      where: { id: contactB.id },
    });
    expect(untouched?.fullName).toBe("Contato Organização B");
  });

  it("blocks contact writes for VIEWER memberships", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Contact Viewer", slug: "contact-viewer" },
    });
    const password = "Strong-Contact-Viewer-2026!";
    const user = await createUser({
      email: "contact-viewer@example.test",
      password,
      displayName: "Contact Viewer",
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
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Contato não autorizado" })
      .expect(403);
  });

  it("creates, updates and soft-deletes a contact with audit records", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Contact Lifecycle", slug: "contact-lifecycle" },
    });
    const password = "Strong-Contact-Lifecycle-2026!";
    const user = await createUser({
      email: "contact-lifecycle@example.test",
      password,
      displayName: "Contact Lifecycle Admin",
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
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-contact-create")
      .send({
        fullName: "Contato Criado",
        jobTitle: "Analista",
      })
      .expect(201);

    const contactId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-contact-update")
      .send({ jobTitle: "Analista Sênior" })
      .expect(200);

    expect(updated.body.jobTitle).toBe("Analista Sênior");

    await request(app.getHttpServer())
      .delete(`/api/v1/contacts/${contactId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "cycle2-contact-delete")
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    const stored = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(stored?.deletedBy).toBe(user.id);

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        entityId: contactId,
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(auditActions.map(item => item.action)).toEqual([
      "contact.created",
      "contact.updated",
      "contact.deleted",
    ]);
  });

  it("manages contact channels transactionally and blocks cross-organization channel access", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Channel Organization A", slug: "channel-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Channel Organization B", slug: "channel-org-b" },
      }),
    ]);
    const password = "Strong-Channel-Password-2026!";
    const user = await createUser({
      email: "channel-admin@example.test",
      password,
      displayName: "Channel Admin",
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

    const [contactA, contactB] = await Promise.all([
      prisma.contact.create({
        data: {
          organizationId: organizationA.id,
          fullName: "Contato Canais A",
          createdBy: user.id,
          updatedBy: user.id,
        },
      }),
      prisma.contact.create({
        data: {
          organizationId: organizationB.id,
          fullName: "Contato Canais B",
          createdBy: user.id,
          updatedBy: user.id,
        },
      }),
    ]);

    const channelB = await prisma.contactChannel.create({
      data: {
        organizationId: organizationB.id,
        contactId: contactB.id,
        type: "EMAIL",
        value: "org-b@example.test",
        isPrimary: true,
      },
    });

    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });

    const firstEmail = await request(app.getHttpServer())
      .post(`/api/v1/contacts/${contactA.id}/channels`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle2-channel-email-1")
      .send({
        type: "EMAIL",
        value: "first@example.test",
        isPrimary: true,
      })
      .expect(201);

    const secondEmail = await request(app.getHttpServer())
      .post(`/api/v1/contacts/${contactA.id}/channels`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle2-channel-email-2")
      .send({
        type: "EMAIL",
        value: "second@example.test",
        isPrimary: true,
      })
      .expect(201);

    const mobile = await request(app.getHttpServer())
      .post(`/api/v1/contacts/${contactA.id}/channels`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle2-channel-mobile")
      .send({
        type: "MOBILE",
        value: "+5548999999999",
        isPrimary: true,
      })
      .expect(201);

    const afterCreate = await prisma.contactChannel.findMany({
      where: { organizationId: organizationA.id, contactId: contactA.id },
      orderBy: { createdAt: "asc" },
    });

    expect(afterCreate).toHaveLength(3);
    expect(
      afterCreate.find(item => item.id === firstEmail.body.id)?.isPrimary
    ).toBe(false);
    expect(
      afterCreate.find(item => item.id === secondEmail.body.id)?.isPrimary
    ).toBe(true);
    expect(
      afterCreate.find(item => item.id === mobile.body.id)?.isPrimary
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactA.id}/channels/${firstEmail.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle2-channel-email-promote")
      .send({
        type: "EMAIL",
        value: "first-updated@example.test",
        isPrimary: true,
      })
      .expect(200);

    const emails = await prisma.contactChannel.findMany({
      where: {
        organizationId: organizationA.id,
        contactId: contactA.id,
        type: "EMAIL",
      },
    });

    expect(emails.find(item => item.id === firstEmail.body.id)).toMatchObject({
      value: "first-updated@example.test",
      isPrimary: true,
    });
    expect(
      emails.find(item => item.id === secondEmail.body.id)?.isPrimary
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/contacts/${contactB.id}/channels`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "PHONE", value: "4899999999" })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactB.id}/channels/${channelB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "EMAIL",
        value: "cross-tenant@example.test",
        isPrimary: true,
      })
      .expect(404);

    const untouchedChannelB = await prisma.contactChannel.findUnique({
      where: { id: channelB.id },
    });
    expect(untouchedChannelB?.value).toBe("org-b@example.test");

    await request(app.getHttpServer())
      .delete(`/api/v1/contacts/${contactA.id}/channels/${secondEmail.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "cycle2-channel-delete")
      .expect(204);

    expect(
      await prisma.contactChannel.findUnique({
        where: { id: secondEmail.body.id as string },
      })
    ).toBeNull();

    const channelAudit = await prisma.auditLog.findMany({
      where: {
        organizationId: organizationA.id,
        entityType: "contact_channel",
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(channelAudit.map(item => item.action)).toEqual([
      "contact.channel_created",
      "contact.channel_created",
      "contact.channel_created",
      "contact.channel_updated",
      "contact.channel_deleted",
    ]);
  });
});

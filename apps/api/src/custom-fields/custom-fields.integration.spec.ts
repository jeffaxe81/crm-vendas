import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 2 custom fields API", () => {
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

  it("creates, lists and updates definitions per organization and scope while keeping VIEWER read-only", async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Custom Fields Management",
        slug: "custom-fields-management",
      },
    });
    const admin = await createUser({
      email: "custom-fields-admin@example.test",
      password: "Strong-Custom-Fields-Admin-2026!",
      displayName: "Custom Fields Admin",
    });
    const viewer = await createUser({
      email: "custom-fields-viewer@example.test",
      password: "Strong-Custom-Fields-Viewer-2026!",
      displayName: "Custom Fields Viewer",
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

    const adminToken = await login({
      email: admin.email,
      password: "Strong-Custom-Fields-Admin-2026!",
      organizationSlug: organization.slug,
    });
    const viewerToken = await login({
      email: viewer.email,
      password: "Strong-Custom-Fields-Viewer-2026!",
      organizationSlug: organization.slug,
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/custom-fields")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-request-id", "cycle2-custom-field-create")
      .send({
        scope: "COMPANY",
        key: "segmento",
        label: "Segmento",
        type: "SELECT",
        options: ["Enterprise", "SMB"],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      scope: "COMPANY",
      key: "segmento",
      label: "Segmento",
      type: "SELECT",
      isRequired: false,
      isActive: true,
      options: ["Enterprise", "SMB"],
    });

    await request(app.getHttpServer())
      .post("/api/v1/custom-fields")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        scope: "COMPANY",
        key: "segmento",
        label: "Duplicado",
        type: "TEXT",
      })
      .expect(409);

    await request(app.getHttpServer())
      .post("/api/v1/custom-fields")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        scope: "CONTACT",
        key: "segmento",
        label: "Segmento do contato",
        type: "TEXT",
      })
      .expect(201);

    const viewerList = await request(app.getHttpServer())
      .get("/api/v1/custom-fields?scope=COMPANY")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(200);

    expect(viewerList.body).toHaveLength(1);
    expect(viewerList.body[0]).toMatchObject({
      id: created.body.id,
      scope: "COMPANY",
      key: "segmento",
    });

    await request(app.getHttpServer())
      .post("/api/v1/custom-fields")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        scope: "COMPANY",
        key: "viewer_nao_pode",
        label: "Viewer não pode criar",
        type: "TEXT",
      })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/custom-fields/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-request-id", "cycle2-custom-field-update")
      .send({ label: "Segmento comercial", isRequired: true })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.body.id,
      label: "Segmento comercial",
      isRequired: true,
    });

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        action: { in: ["custom_field.created", "custom_field.updated"] },
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(audit.map(item => item.action)).toEqual([
      "custom_field.created",
      "custom_field.created",
      "custom_field.updated",
    ]);
  });

  it("upserts and removes company values only when organization, target and definition scope match", async () => {
    const first = await createOrganizationAdmin({
      organizationName: "Custom Fields Org A",
      organizationSlug: "custom-fields-org-a",
      email: "custom-fields-a@example.test",
      password: "Strong-Custom-Fields-A-2026!",
    });
    const second = await createOrganizationAdmin({
      organizationName: "Custom Fields Org B",
      organizationSlug: "custom-fields-org-b",
      email: "custom-fields-b@example.test",
      password: "Strong-Custom-Fields-B-2026!",
    });

    const companyA = await prisma.withTenant(first.organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: first.organization.id,
          legalName: "Empresa A",
          createdBy: first.user.id,
          updatedBy: first.user.id,
        },
      })
    );
    const companyB = await prisma.withTenant(second.organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: second.organization.id,
          legalName: "Empresa B",
          createdBy: second.user.id,
          updatedBy: second.user.id,
        },
      })
    );
    const companyDefinitionA = await prisma.customFieldDefinition.create({
      data: {
        organizationId: first.organization.id,
        scope: "COMPANY",
        key: "score",
        label: "Score",
        type: "NUMBER",
      },
    });
    const contactDefinitionA = await prisma.customFieldDefinition.create({
      data: {
        organizationId: first.organization.id,
        scope: "CONTACT",
        key: "perfil",
        label: "Perfil",
        type: "TEXT",
      },
    });
    const companyDefinitionB = await prisma.customFieldDefinition.create({
      data: {
        organizationId: second.organization.id,
        scope: "COMPANY",
        key: "score",
        label: "Score",
        type: "NUMBER",
      },
    });

    await request(app.getHttpServer())
      .put(
        `/api/v1/companies/${companyA.id}/custom-fields/${companyDefinitionA.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .send({ value: "alto" })
      .expect(400);

    const firstSet = await request(app.getHttpServer())
      .put(
        `/api/v1/companies/${companyA.id}/custom-fields/${companyDefinitionA.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .set("x-request-id", "cycle2-company-custom-field-set-1")
      .send({ value: 7 })
      .expect(200);

    expect(firstSet.body).toMatchObject({
      organizationId: first.organization.id,
      companyId: companyA.id,
      definitionId: companyDefinitionA.id,
      value: 7,
    });

    const secondSet = await request(app.getHttpServer())
      .put(
        `/api/v1/companies/${companyA.id}/custom-fields/${companyDefinitionA.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .set("x-request-id", "cycle2-company-custom-field-set-2")
      .send({ value: 9 })
      .expect(200);

    expect(secondSet.body.value).toBe(9);
    expect(await prisma.companyCustomFieldValue.count()).toBe(1);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyA.id}/custom-fields`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      definitionId: companyDefinitionA.id,
      value: 9,
    });

    await request(app.getHttpServer())
      .put(
        `/api/v1/companies/${companyA.id}/custom-fields/${contactDefinitionA.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .send({ value: "Inválido por escopo" })
      .expect(404);

    await request(app.getHttpServer())
      .put(
        `/api/v1/companies/${companyB.id}/custom-fields/${companyDefinitionA.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .send({ value: 5 })
      .expect(404);

    await request(app.getHttpServer())
      .put(
        `/api/v1/companies/${companyA.id}/custom-fields/${companyDefinitionB.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .send({ value: 5 })
      .expect(404);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/companies/${companyA.id}/custom-fields/${companyDefinitionA.id}`
      )
      .set("Authorization", `Bearer ${first.token}`)
      .set("x-request-id", "cycle2-company-custom-field-remove")
      .expect(204);

    expect(await prisma.companyCustomFieldValue.count()).toBe(0);

    const audit = await prisma.auditLog.findMany({
      where: {
        organizationId: first.organization.id,
        action: {
          in: ["custom_field.value_set", "custom_field.value_removed"],
        },
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });

    expect(audit.map(item => item.action)).toEqual([
      "custom_field.value_set",
      "custom_field.value_set",
      "custom_field.value_removed",
    ]);
  });

  it("supports contact custom values and rejects company definitions on contacts", async () => {
    const { organization, user, token } = await createOrganizationAdmin({
      organizationName: "Custom Fields Contact",
      organizationSlug: "custom-fields-contact",
      email: "custom-fields-contact@example.test",
      password: "Strong-Custom-Fields-Contact-2026!",
    });

    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        fullName: "Contato customizado",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const contactDefinition = await prisma.customFieldDefinition.create({
      data: {
        organizationId: organization.id,
        scope: "CONTACT",
        key: "origem",
        label: "Origem",
        type: "SELECT",
        options: ["Evento", "Indicação"],
      },
    });
    const companyDefinition = await prisma.customFieldDefinition.create({
      data: {
        organizationId: organization.id,
        scope: "COMPANY",
        key: "origem_empresa",
        label: "Origem empresa",
        type: "TEXT",
      },
    });

    await request(app.getHttpServer())
      .put(
        `/api/v1/contacts/${contact.id}/custom-fields/${contactDefinition.id}`
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ value: "Outra" })
      .expect(400);

    await request(app.getHttpServer())
      .put(
        `/api/v1/contacts/${contact.id}/custom-fields/${contactDefinition.id}`
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ value: "Evento" })
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contact.id}/custom-fields`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      contactId: contact.id,
      definitionId: contactDefinition.id,
      value: "Evento",
    });

    await request(app.getHttpServer())
      .put(
        `/api/v1/contacts/${contact.id}/custom-fields/${companyDefinition.id}`
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ value: "Inválido" })
      .expect(404);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/contacts/${contact.id}/custom-fields/${contactDefinition.id}`
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    expect(await prisma.contactCustomFieldValue.count()).toBe(0);
  });
});

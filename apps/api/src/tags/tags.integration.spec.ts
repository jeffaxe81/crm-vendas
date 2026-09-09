import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("Cycle 2 tags API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => resetDatabase());
  afterAll(async () => { await resetDatabase(); await app.close(); });

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      contact_custom_field_values, company_custom_field_values,
      custom_field_definitions, contact_tags, company_tags, tags,
      relationship_entries, company_contacts, contact_channels, contacts,
      companies, audit_logs, refresh_sessions, organization_memberships,
      users, organizations CASCADE`);
  }

  async function createUser(input: { email: string; password: string; displayName: string }) {
    return prisma.user.create({ data: { email: input.email, emailNormalized: input.email.toLowerCase(), displayName: input.displayName, passwordHash: await passwords.hash(input.password) } });
  }

  async function login(input: { email: string; password: string; organizationSlug: string }): Promise<string> {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send(input).expect(200);
    return response.body.accessToken as string;
  }

  async function createOrganizationAdmin(input: { organizationName: string; organizationSlug: string; email: string; password: string }) {
    const organization = await prisma.organization.create({ data: { name: input.organizationName, slug: input.organizationSlug } });
    const user = await createUser({ email: input.email, password: input.password, displayName: `${input.organizationName} Admin` });
    await prisma.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "ADMIN" } });
    const token = await login({ email: input.email, password: input.password, organizationSlug: input.organizationSlug });
    return { organization, user, token };
  }

  it("normalizes tag names for uniqueness within an organization but allows the same name in another organization", async () => {
    const first = await createOrganizationAdmin({ organizationName: "Tags Organization A", organizationSlug: "tags-org-a", email: "tags-a@example.test", password: "Strong-Tags-A-Password-2026!" });
    const second = await createOrganizationAdmin({ organizationName: "Tags Organization B", organizationSlug: "tags-org-b", email: "tags-b@example.test", password: "Strong-Tags-B-Password-2026!" });
    const created = await request(app.getHttpServer()).post("/api/v1/tags").set("Authorization", `Bearer ${first.token}`).set("x-request-id", "cycle2-tag-create-a").send({ name: "  Prioridade VIP  " }).expect(201);
    expect(created.body).toMatchObject({ name: "Prioridade VIP", normalizedName: "prioridade vip" });
    await request(app.getHttpServer()).post("/api/v1/tags").set("Authorization", `Bearer ${first.token}`).send({ name: "PRIORIDADE VIP" }).expect(409);
    await request(app.getHttpServer()).post("/api/v1/tags").set("Authorization", `Bearer ${second.token}`).send({ name: "Prioridade VIP" }).expect(201);
    expect(await prisma.tag.count({ where: { organizationId: first.organization.id } })).toBe(1);
    expect(await prisma.tag.count({ where: { organizationId: second.organization.id } })).toBe(1);
  });

  it("rejects cross-organization tag links for companies and contacts", async () => {
    const password = "Strong-Tags-Isolation-Password-2026!";
    const organizationA = await prisma.organization.create({ data: { name: "Tag Isolation A", slug: "tag-isolation-a" } });
    const organizationB = await prisma.organization.create({ data: { name: "Tag Isolation B", slug: "tag-isolation-b" } });
    const user = await createUser({ email: "tag-isolation@example.test", password, displayName: "Tag Isolation Admin" });
    await prisma.organizationMembership.createMany({ data: [{ organizationId: organizationA.id, userId: user.id, role: "ADMIN" }, { organizationId: organizationB.id, userId: user.id, role: "ADMIN" }] });
    const tagA = await prisma.tag.create({ data: { organizationId: organizationA.id, name: "Tag A", normalizedName: "tag a" } });
    const tagB = await prisma.tag.create({ data: { organizationId: organizationB.id, name: "Tag B", normalizedName: "tag b" } });
    const companyA = await prisma.withTenant(organizationA.id, tenant => tenant.company.create({ data: { organizationId: organizationA.id, legalName: "Empresa A", createdBy: user.id, updatedBy: user.id } }));
    const companyB = await prisma.withTenant(organizationB.id, tenant => tenant.company.create({ data: { organizationId: organizationB.id, legalName: "Empresa B", createdBy: user.id, updatedBy: user.id } }));
    const contactA = await prisma.contact.create({ data: { organizationId: organizationA.id, fullName: "Contato A", createdBy: user.id, updatedBy: user.id } });
    const contactB = await prisma.contact.create({ data: { organizationId: organizationB.id, fullName: "Contato B", createdBy: user.id, updatedBy: user.id } });
    const tokenA = await login({ email: user.email, password, organizationSlug: organizationA.slug });
    await request(app.getHttpServer()).post(`/api/v1/companies/${companyB.id}/tags/${tagA.id}`).set("Authorization", `Bearer ${tokenA}`).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/companies/${companyA.id}/tags/${tagB.id}`).set("Authorization", `Bearer ${tokenA}`).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/contacts/${contactB.id}/tags/${tagA.id}`).set("Authorization", `Bearer ${tokenA}`).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/contacts/${contactA.id}/tags/${tagB.id}`).set("Authorization", `Bearer ${tokenA}`).expect(404);
    expect(await prisma.companyTag.count()).toBe(0);
    expect(await prisma.contactTag.count()).toBe(0);
  });

  it("links and unlinks tags in the active organization and records audit actions", async () => {
    const { organization, user, token } = await createOrganizationAdmin({ organizationName: "Tag Lifecycle", organizationSlug: "tag-lifecycle", email: "tag-lifecycle@example.test", password: "Strong-Tag-Lifecycle-2026!" });
    const company = await prisma.withTenant(organization.id, tenant => tenant.company.create({ data: { organizationId: organization.id, legalName: "Empresa com Tag", createdBy: user.id, updatedBy: user.id } }));
    const [contact, tag] = await Promise.all([
      prisma.contact.create({ data: { organizationId: organization.id, fullName: "Contato com Tag", createdBy: user.id, updatedBy: user.id } }),
      prisma.tag.create({ data: { organizationId: organization.id, name: "Importante", normalizedName: "importante" } }),
    ]);
    await request(app.getHttpServer()).post(`/api/v1/companies/${company.id}/tags/${tag.id}`).set("Authorization", `Bearer ${token}`).set("x-request-id", "cycle2-company-tag-link").expect(201);
    await request(app.getHttpServer()).post(`/api/v1/contacts/${contact.id}/tags/${tag.id}`).set("Authorization", `Bearer ${token}`).set("x-request-id", "cycle2-contact-tag-link").expect(201);
    expect(await prisma.companyTag.count()).toBe(1);
    expect(await prisma.contactTag.count()).toBe(1);
    await request(app.getHttpServer()).delete(`/api/v1/companies/${company.id}/tags/${tag.id}`).set("Authorization", `Bearer ${token}`).set("x-request-id", "cycle2-company-tag-unlink").expect(204);
    await request(app.getHttpServer()).delete(`/api/v1/contacts/${contact.id}/tags/${tag.id}`).set("Authorization", `Bearer ${token}`).set("x-request-id", "cycle2-contact-tag-unlink").expect(204);
    const audit = await prisma.auditLog.findMany({ where: { organizationId: organization.id, action: { in: ["tag.linked", "tag.unlinked"] } }, orderBy: { createdAt: "asc" }, select: { action: true } });
    expect(audit.map(item => item.action)).toEqual(["tag.linked", "tag.linked", "tag.unlinked", "tag.unlinked"]);
  });
});

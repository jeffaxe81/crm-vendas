import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C5.1 tickets API", () => {
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
         ticket_events,
         tickets,
         ticket_protocol_counters,
         opportunity_items,
         products,
         opportunities,
         activities,
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
         pipeline_stages,
         pipelines,
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

  async function createSession(
    role: "ADMIN" | "MANAGER" | "SELLER" | "VIEWER",
    suffix: string
  ) {
    const organization = await prisma.organization.create({
      data: { name: `Tickets ${suffix}`, slug: `tickets-${suffix}` },
    });
    const password = "Strong-Products-Password-2026!";
    const user = await createUser({
      email: `tickets-${suffix}@example.test`,
      password,
      displayName: `Tickets ${suffix}`,
    });
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

  const api = () => request(app.getHttpServer());

  const openTicket = (token: string, body: Record<string, unknown>) =>
    api()
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c5-1-ticket")
      .send(body);

  it("opens tickets with sequential yearly protocols per organization", async () => {
    const tenantA = await createSession("ADMIN", "protocol-a");
    const tenantB = await createSession("ADMIN", "protocol-b");

    const first = await openTicket(tenantA.token, {
      subject: "Ramal sem áudio",
      priority: "HIGH",
      channel: "PHONE",
    }).expect(201);
    const second = await openTicket(tenantA.token, {
      subject: "Troca de senha",
    }).expect(201);
    const otherTenant = await openTicket(tenantB.token, {
      subject: "Primeiro do tenant B",
    }).expect(201);

    const year = new Date().getUTCFullYear();
    expect(first.body.protocol).toMatch(
      new RegExp(`^(${year}|${year - 1}|${year + 1})-000001$`)
    );
    expect(second.body.protocol.endsWith("-000002")).toBe(true);
    expect(otherTenant.body.protocol.endsWith("-000001")).toBe(true);
    expect(first.body).toMatchObject({
      status: "OPEN",
      priority: "HIGH",
      channel: "PHONE",
      version: 1,
      firstResponseAt: null,
    });

    const events = await api()
      .get(`/api/v1/tickets/${first.body.id}/events`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual([
      "CREATED",
    ]);

    const search = await api()
      .get(`/api/v1/tickets?q=${second.body.protocol}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(search.body.total).toBe(1);

    await api()
      .get(`/api/v1/tickets/${first.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);
  });

  it("generates unique protocols under concurrent creation", async () => {
    const { token } = await createSession("ADMIN", "concurrency");
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        openTicket(token, { subject: `Concorrente ${index}` })
      )
    );
    const protocols = responses.map(response => {
      expect(response.status).toBe(201);
      return response.body.protocol as string;
    });
    expect(new Set(protocols).size).toBe(8);
  });

  it("walks the status lifecycle with timestamps, timeline and audit", async () => {
    const { organization, token } = await createSession("ADMIN", "lifecycle");
    const created = (
      await openTicket(token, { subject: "Queda de link" }).expect(201)
    ).body;

    const inProgress = await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS", version: 1 })
      .expect(201);
    expect(inProgress.body.firstResponseAt).not.toBeNull();
    expect(inProgress.body.version).toBe(2);

    await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "CLOSED", version: 2 })
      .expect(400);

    const resolved = await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RESOLVED", note: "Link restabelecido", version: 2 })
      .expect(201);
    expect(resolved.body.resolvedAt).not.toBeNull();

    const reopened = await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS", version: 3 })
      .expect(201);
    expect(reopened.body.resolvedAt).toBeNull();

    await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RESOLVED", version: 4 })
      .expect(201);
    const closed = await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "CLOSED", version: 5 })
      .expect(201);
    expect(closed.body).toMatchObject({ status: "CLOSED", version: 6 });
    expect(closed.body.closedAt).not.toBeNull();

    await api()
      .patch(`/api/v1/tickets/${created.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Não pode", version: 6 })
      .expect(400);
    await api()
      .post(`/api/v1/tickets/${created.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Cliente ligou de novo", version: 6 })
      .expect(400);
    await api()
      .post(`/api/v1/tickets/${created.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        body: "Nota interna pós-fechamento",
        isInternal: true,
        version: 6,
      })
      .expect(201);

    const events = await api()
      .get(`/api/v1/tickets/${created.id}/events`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(
      events.body.items.map(
        (event: { type: string; toStatus: string | null }) =>
          event.type === "STATUS_CHANGED" ? event.toStatus : event.type
      )
    ).toEqual([
      "CREATED",
      "IN_PROGRESS",
      "RESOLVED",
      "IN_PROGRESS",
      "RESOLVED",
      "CLOSED",
      "COMMENT",
    ]);

    const audit = await prisma.withTenant(organization.id, tenant =>
      tenant.auditLog.count({
        where: { organizationId: organization.id, entityType: "ticket" },
      })
    );
    expect(audit).toBe(7);
  });

  it("records first response on the first public comment and enforces version", async () => {
    const { token } = await createSession("SELLER", "comments");
    const created = (
      await openTicket(token, { subject: "Dúvida de fatura" }).expect(201)
    ).body;

    const internal = await api()
      .post(`/api/v1/tickets/${created.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Verificar com financeiro", isInternal: true, version: 1 })
      .expect(201);
    expect(internal.body.ticket.firstResponseAt).toBeNull();

    const publicComment = await api()
      .post(`/api/v1/tickets/${created.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Estamos verificando.", version: 2 })
      .expect(201);
    expect(publicComment.body.ticket.firstResponseAt).not.toBeNull();
    expect(publicComment.body.event).toMatchObject({
      type: "COMMENT",
      isInternal: false,
    });

    await api()
      .post(`/api/v1/tickets/${created.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Versão velha", version: 2 })
      .expect(409);
  });

  it("validates customer and assignee references inside the tenant and logs assignment", async () => {
    const tenantA = await createSession("ADMIN", "refs-a");
    const tenantB = await createSession("ADMIN", "refs-b");

    const foreignCompany = await prisma.withTenant(
      tenantB.organization.id,
      tenant =>
        tenant.company.create({
          data: {
            organizationId: tenantB.organization.id,
            legalName: "Empresa B",
            createdBy: tenantB.user.id,
            updatedBy: tenantB.user.id,
          },
        })
    );
    await openTicket(tenantA.token, {
      subject: "Cliente de outro tenant",
      companyId: foreignCompany.id,
    }).expect(404);
    await openTicket(tenantA.token, {
      subject: "Responsável de outro tenant",
      assigneeUserId: tenantB.user.id,
    }).expect(404);

    const created = (
      await openTicket(tenantA.token, { subject: "Atribuir" }).expect(201)
    ).body;
    const assigned = await api()
      .patch(`/api/v1/tickets/${created.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ assigneeUserId: tenantA.user.id, priority: "URGENT", version: 1 })
      .expect(200);
    expect(assigned.body).toMatchObject({
      assigneeUserId: tenantA.user.id,
      priority: "URGENT",
      version: 2,
    });

    const events = await api()
      .get(`/api/v1/tickets/${created.id}/events`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual([
      "CREATED",
      "ASSIGNED",
      "UPDATED",
    ]);

    const mine = await api()
      .get(`/api/v1/tickets?assigneeUserId=${tenantA.user.id}&priority=URGENT`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(mine.body.total).toBe(1);
  });

  it("lets VIEWER read but not write, and keeps the timeline append-only", async () => {
    const admin = await createSession("ADMIN", "rbac");
    const created = (
      await openTicket(admin.token, { subject: "Somente leitura" }).expect(201)
    ).body;

    const viewerUser = await createUser({
      email: "tickets-viewer@example.test",
      password: "Strong-Products-Password-2026!",
      displayName: "Viewer",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: admin.organization.id,
        userId: viewerUser.id,
        role: "VIEWER",
      },
    });
    const viewerToken = await login({
      email: viewerUser.email,
      password: "Strong-Products-Password-2026!",
      organizationSlug: admin.organization.slug,
    });

    await api()
      .get("/api/v1/tickets")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(200);
    await openTicket(viewerToken, { subject: "Bloqueado" }).expect(403);
    await api()
      .post(`/api/v1/tickets/${created.id}/status`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ status: "IN_PROGRESS", version: 1 })
      .expect(403);

    await expect(
      prisma.withTenant(admin.organization.id, tenant =>
        tenant.ticketEvent.updateMany({
          where: { ticketId: created.id },
          data: { body: "adulterado" },
        })
      )
    ).rejects.toThrow();
  });
});

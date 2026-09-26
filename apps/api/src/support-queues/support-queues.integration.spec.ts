import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type Role = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const PASSWORD = "Strong-Queues-Password-2026!";

describe("C5.2 support queues and assignment API", () => {
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
         support_queues,
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

  const api = () => request(app.getHttpServer());

  async function login(email: string, organizationSlug: string) {
    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD, organizationSlug })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function addMember(
    organization: { id: string; slug: string },
    role: Role,
    suffix: string,
    options: { createdAt?: Date; isActive?: boolean } = {}
  ) {
    const email = `queues-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `Queues ${suffix}`,
        passwordHash: await passwords.hash(PASSWORD),
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role,
        isActive: options.isActive ?? true,
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
    });
    const token =
      options.isActive === false ? "" : await login(email, organization.slug);
    return { user, token };
  }

  async function createTenant(suffix: string, role: Role = "ADMIN") {
    const organization = await prisma.organization.create({
      data: { name: `Queues ${suffix}`, slug: `queues-${suffix}` },
    });
    const member = await addMember(organization, role, suffix);
    return { organization, ...member };
  }

  const createQueue = (token: string, body: Record<string, unknown>) =>
    api()
      .post("/api/v1/support-queues")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c5-2-queue")
      .send(body);

  const openTicket = (token: string, body: Record<string, unknown>) =>
    api()
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  it("manages queues with support.manage and lets every role list them", async () => {
    const admin = await createTenant("crud");
    const manager = await addMember(admin.organization, "MANAGER", "crud-m");
    const seller = await addMember(admin.organization, "SELLER", "crud-s");
    const viewer = await addMember(admin.organization, "VIEWER", "crud-v");

    const created = await createQueue(admin.token, {
      name: " Suporte N1 ",
      description: "Primeiro nível",
    }).expect(201);
    expect(created.body).toMatchObject({
      name: "Suporte N1",
      description: "Primeiro nível",
      isActive: true,
      autoAssign: false,
      version: 1,
      openTicketCount: 0,
    });

    await createQueue(seller.token, { name: "Proibida" }).expect(403);
    await createQueue(viewer.token, { name: "Proibida" }).expect(403);
    await createQueue(admin.token, { name: "" }).expect(400);

    const updated = await api()
      .patch(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ autoAssign: true, description: null, version: 1 })
      .expect(200);
    expect(updated.body).toMatchObject({
      autoAssign: true,
      description: null,
      version: 2,
    });
    await api()
      .patch(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "Versão velha", version: 1 })
      .expect(409);
    await api()
      .patch(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ name: "Seller", version: 2 })
      .expect(403);

    for (const token of [seller.token, viewer.token]) {
      const list = await api()
        .get("/api/v1/support-queues")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(list.body.items).toHaveLength(1);
    }
    await api()
      .get(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);

    await api()
      .delete(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(403);
    await api()
      .delete(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(204);
    await api()
      .get(`/api/v1/support-queues/${created.body.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(404);

    const actions = await prisma.withTenant(admin.organization.id, tenant =>
      tenant.auditLog.findMany({
        where: {
          organizationId: admin.organization.id,
          entityType: "support_queue",
        },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    );
    expect(actions.map(item => item.action)).toEqual([
      "support_queue.created",
      "support_queue.updated",
      "support_queue.deleted",
    ]);
  });

  it("keeps queue names unique per tenant ignoring case and isolates tenants", async () => {
    const tenantA = await createTenant("unique-a");
    const tenantB = await createTenant("unique-b");

    const first = await createQueue(tenantA.token, {
      name: "Financeiro",
    }).expect(201);
    const clash = await createQueue(tenantA.token, {
      name: "FINANCEIRO",
    }).expect(409);
    expect(clash.body.code).toBe("SUPPORT_QUEUE_NAME_CONFLICT");
    await createQueue(tenantB.token, { name: "financeiro" }).expect(201);

    const other = await createQueue(tenantA.token, {
      name: "Técnico",
    }).expect(201);
    await api()
      .patch(`/api/v1/support-queues/${other.body.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ name: "financeiro", version: 1 })
      .expect(409);

    const listB = await api()
      .get("/api/v1/support-queues")
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(200);
    expect(listB.body.items).toHaveLength(1);
    await api()
      .get(`/api/v1/support-queues/${first.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);
    await api()
      .patch(`/api/v1/support-queues/${first.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .send({ name: "Invasão", version: 1 })
      .expect(404);
    await api()
      .delete(`/api/v1/support-queues/${first.body.id}`)
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(404);

    // Nome volta a ficar disponível após a exclusão lógica.
    await api()
      .delete(`/api/v1/support-queues/${first.body.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(204);
    await createQueue(tenantA.token, { name: "Financeiro" }).expect(201);

    // RLS (papel de runtime): B não enxerga filas de A e sem contexto nada.
    const rls = new PrismaService(process.env.RLS_DATABASE_URL);
    try {
      const leaked = await rls.withTenant(tenantB.organization.id, tenant =>
        tenant.supportQueue.count({
          where: { organizationId: tenantA.organization.id },
        })
      );
      expect(leaked).toBe(0);
      expect(await rls.supportQueue.count()).toBe(0);
      await expect(
        rls.withTenant(tenantB.organization.id, tenant =>
          tenant.supportQueue.create({
            data: {
              organizationId: tenantA.organization.id,
              name: "Injetada",
              createdBy: tenantB.user.id,
              updatedBy: tenantB.user.id,
            },
          })
        )
      ).rejects.toThrow();
    } finally {
      await rls.onModuleDestroy();
    }

    // FK composta: solicitação de B não aponta para fila de A.
    const ticketB = (
      await openTicket(tenantB.token, { subject: "Tenant B" }).expect(201)
    ).body;
    await expect(
      prisma.ticket.update({
        where: { id: ticketB.id },
        data: { queueId: other.body.id },
      })
    ).rejects.toThrow();
  });

  it("links tickets to active queues, logs queue changes and blocks deleting queues with open tickets", async () => {
    const tenantA = await createTenant("link-a");
    const tenantB = await createTenant("link-b");
    const queue = (await createQueue(tenantA.token, { name: "N1" })).body;
    const queue2 = (await createQueue(tenantA.token, { name: "N2" })).body;
    const inactive = (
      await createQueue(tenantA.token, { name: "Antiga", isActive: false })
    ).body;
    const foreign = (await createQueue(tenantB.token, { name: "B" })).body;

    await openTicket(tenantA.token, {
      subject: "Fila de outro tenant",
      queueId: foreign.id,
    }).expect(404);
    const inactiveResponse = await openTicket(tenantA.token, {
      subject: "Fila inativa",
      queueId: inactive.id,
    }).expect(400);
    expect(inactiveResponse.body.code).toBe("SUPPORT_QUEUE_INACTIVE");

    const ticket = (
      await openTicket(tenantA.token, {
        subject: "Sem internet",
        queueId: queue.id,
      }).expect(201)
    ).body;
    expect(ticket).toMatchObject({ queueId: queue.id, assigneeUserId: null });

    const listed = await api()
      .get("/api/v1/support-queues")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(
      listed.body.items.find((item: { id: string }) => item.id === queue.id)
        .openTicketCount
    ).toBe(1);

    const blocked = await api()
      .delete(`/api/v1/support-queues/${queue.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(409);
    expect(blocked.body.code).toBe("SUPPORT_QUEUE_HAS_OPEN_TICKETS");

    await api()
      .patch(`/api/v1/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ queueId: inactive.id, version: 1 })
      .expect(400);
    await api()
      .patch(`/api/v1/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ queueId: foreign.id, version: 1 })
      .expect(404);
    const moved = await api()
      .patch(`/api/v1/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ queueId: queue2.id, version: 1 })
      .expect(200);
    expect(moved.body).toMatchObject({ queueId: queue2.id, version: 2 });

    const filtered = await api()
      .get(`/api/v1/tickets?queueId=${queue2.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(filtered.body.total).toBe(1);
    const emptyFilter = await api()
      .get(`/api/v1/tickets?queueId=${queue.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(emptyFilter.body.total).toBe(0);

    const events = await api()
      .get(`/api/v1/tickets/${ticket.id}/events`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual([
      "CREATED",
      "UPDATED",
    ]);
    expect(events.body.items[0].metadata).toEqual({ queueId: queue.id });
    expect(events.body.items[1].metadata).toEqual({
      fields: ["queueId"],
      fromQueueId: queue.id,
      toQueueId: queue2.id,
    });

    // A fila antiga já pode ser excluída; a nova, só após resolver.
    await api()
      .delete(`/api/v1/support-queues/${queue.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(204);
    await api()
      .delete(`/api/v1/support-queues/${queue2.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(409);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/status`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ status: "RESOLVED", version: 2 })
      .expect(201);
    await api()
      .delete(`/api/v1/support-queues/${queue2.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(204);

    await openTicket(tenantA.token, {
      subject: "Fila excluída",
      queueId: queue2.id,
    }).expect(404);

    const unassign = await api()
      .patch(`/api/v1/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ queueId: null, version: 3 })
      .expect(200);
    expect(unassign.body.queueId).toBeNull();
  });

  it("assigns tickets to the current user and filters assigneeUserId=me", async () => {
    const admin = await createTenant("assign");
    const seller = await addMember(admin.organization, "SELLER", "assign-s");
    const viewer = await addMember(admin.organization, "VIEWER", "assign-v");

    const ticket = (
      await openTicket(admin.token, {
        subject: "Assumir",
        assigneeUserId: admin.user.id,
      }).expect(201)
    ).body;
    await openTicket(admin.token, { subject: "Outra" }).expect(201);

    await api()
      .post(`/api/v1/tickets/${ticket.id}/assign-to-me`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ version: 1 })
      .expect(403);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/assign-to-me`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({})
      .expect(400);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/assign-to-me`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ version: 9 })
      .expect(409);

    const assigned = await api()
      .post(`/api/v1/tickets/${ticket.id}/assign-to-me`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ version: 1 })
      .expect(200);
    expect(assigned.body).toMatchObject({
      assigneeUserId: seller.user.id,
      version: 2,
    });

    // Idempotente quando já é o responsável.
    const again = await api()
      .post(`/api/v1/tickets/${ticket.id}/assign-to-me`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ version: 2 })
      .expect(200);
    expect(again.body.version).toBe(2);

    const mine = await api()
      .get("/api/v1/tickets?assigneeUserId=me")
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(200);
    expect(mine.body.items.map((item: { id: string }) => item.id)).toEqual([
      ticket.id,
    ]);
    const adminMine = await api()
      .get("/api/v1/tickets?assigneeUserId=me")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(adminMine.body.total).toBe(0);
    await api()
      .get("/api/v1/tickets?assigneeUserId=someone")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(400);

    const events = await api()
      .get(`/api/v1/tickets/${ticket.id}/events`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    const assignedEvents = events.body.items.filter(
      (event: { type: string }) => event.type === "ASSIGNED"
    );
    expect(assignedEvents).toHaveLength(1);
    expect(assignedEvents[0].metadata).toMatchObject({
      fromAssigneeUserId: admin.user.id,
      toAssigneeUserId: seller.user.id,
      selfAssigned: true,
    });

    const audit = await prisma.withTenant(admin.organization.id, tenant =>
      tenant.auditLog.count({
        where: {
          organizationId: admin.organization.id,
          action: "ticket.assigned_to_me",
        },
      })
    );
    expect(audit).toBe(1);

    await api()
      .post(`/api/v1/tickets/${ticket.id}/status`)
      .set("Authorization", `Bearer ${seller.token}`)
      .send({ status: "CANCELLED", version: 2 })
      .expect(201);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/assign-to-me`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ version: 3 })
      .expect(400);
  });

  it("auto-assigns to the eligible member with fewest open tickets in the queue, with documented tie-break", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Queues auto", slug: "queues-auto" },
    });
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    const admin = await addMember(organization, "ADMIN", "auto-admin", {
      createdAt: day(3),
    });
    const sellerA = await addMember(organization, "SELLER", "auto-sa", {
      createdAt: day(1),
    });
    const sellerB = await addMember(organization, "SELLER", "auto-sb", {
      createdAt: day(2),
    });
    // Mais antigos, mas inelegíveis: sem ticket.write ou inativo.
    await addMember(organization, "VIEWER", "auto-v", {
      createdAt: new Date(Date.UTC(2025, 0, 1)),
    });
    await addMember(organization, "SELLER", "auto-off", {
      createdAt: new Date(Date.UTC(2025, 0, 2)),
      isActive: false,
    });

    const queue = (
      await createQueue(admin.token, { name: "Auto", autoAssign: true })
    ).body;
    const manual = (await createQueue(admin.token, { name: "Manual" })).body;

    // Carga em outra fila não conta para a fila automática.
    await openTicket(admin.token, {
      subject: "Outra fila",
      queueId: manual.id,
      assigneeUserId: sellerA.user.id,
    }).expect(201);
    const noAuto = await openTicket(admin.token, {
      subject: "Fila manual",
      queueId: manual.id,
    }).expect(201);
    expect(noAuto.body.assigneeUserId).toBeNull();

    const assignees: string[] = [];
    const tickets: { id: string; version: number }[] = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await openTicket(admin.token, {
        subject: `Auto ${index}`,
        queueId: queue.id,
      }).expect(201);
      assignees.push(response.body.assigneeUserId);
      tickets.push(response.body);
    }
    // Empate em 0 → membership mais antiga (A, depois B, depois admin);
    // com todos em 1, volta para A.
    expect(assignees).toEqual([
      sellerA.user.id,
      sellerB.user.id,
      admin.user.id,
      sellerA.user.id,
    ]);

    // Resolver uma solicitação de B reduz a carga dele na fila.
    await api()
      .post(`/api/v1/tickets/${tickets[1]!.id}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "RESOLVED", version: 1 })
      .expect(201);
    const fifth = await openTicket(admin.token, {
      subject: "Auto 5",
      queueId: queue.id,
    }).expect(201);
    expect(fifth.body.assigneeUserId).toBe(sellerB.user.id);

    // Responsável informado explicitamente prevalece.
    const explicit = await openTicket(admin.token, {
      subject: "Explícito",
      queueId: queue.id,
      assigneeUserId: admin.user.id,
    }).expect(201);
    expect(explicit.body.assigneeUserId).toBe(admin.user.id);

    const events = await api()
      .get(`/api/v1/tickets/${tickets[0]!.id}/events`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual([
      "CREATED",
      "ASSIGNED",
    ]);
    expect(events.body.items[1].metadata).toMatchObject({
      toAssigneeUserId: sellerA.user.id,
      autoAssigned: true,
      queueId: queue.id,
    });
  });

  it("balances concurrent openings in an auto-assign queue", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Queues race", slug: "queues-race" },
    });
    const admin = await addMember(organization, "ADMIN", "race-admin");
    const seller = await addMember(organization, "SELLER", "race-s");
    const manager = await addMember(organization, "MANAGER", "race-m");
    const queue = (
      await createQueue(admin.token, { name: "Corrida", autoAssign: true })
    ).body;

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        openTicket(admin.token, { subject: `C${index}`, queueId: queue.id })
      )
    );
    const counts = new Map<string, number>();
    for (const response of responses) {
      expect(response.status).toBe(201);
      const id = response.body.assigneeUserId as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get(admin.user.id)).toBe(2);
    expect(counts.get(seller.user.id)).toBe(2);
    expect(counts.get(manager.user.id)).toBe(2);
  });
});

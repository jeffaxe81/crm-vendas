import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { SLA_CLOCK } from "./sla-clock";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const PASSWORD = "Strong-Sla-Password-2026!";
const MINUTE = 60_000;

describe("C5.3 SLA policies and ticket deadlines", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let clockNow: Date | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SLA_CLOCK)
      .useValue(() => (clockNow ? new Date(clockNow.getTime()) : new Date()))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => {
    clockNow = null;
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
         sla_policies,
         ticket_events,
         tickets,
         ticket_protocol_counters,
         audit_logs,
         refresh_sessions,
         organization_memberships,
         users,
         organizations
       CASCADE`
    );
  }

  const api = () => request(app.getHttpServer());

  async function addMember(
    organization: { id: string; slug: string },
    role: MembershipRole,
    suffix: string
  ) {
    const email = `sla-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `SLA ${suffix}`,
        passwordHash: await passwords.hash(PASSWORD),
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const login = await api()
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD, organizationSlug: organization.slug })
      .expect(200);
    return { user, token: login.body.accessToken as string };
  }

  async function createTenant(suffix: string) {
    const organization = await prisma.organization.create({
      data: { name: `SLA ${suffix}`, slug: `sla-${suffix}` },
    });
    const admin = await addMember(organization, "ADMIN", `${suffix}-admin`);
    return { organization, ...admin };
  }

  const putPolicy = (
    token: string,
    priority: string,
    body: Record<string, unknown>
  ) =>
    api()
      .put(`/api/v1/sla-policies/${priority}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c5-3-sla")
      .send(body);

  const openTicket = (token: string, body: Record<string, unknown>) =>
    api()
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const readTicket = (token: string, id: string) =>
    api().get(`/api/v1/tickets/${id}`).set("Authorization", `Bearer ${token}`);

  it("upserts policies by priority with version, permissions and audit", async () => {
    const tenant = await createTenant("upsert");
    const manager = await addMember(tenant.organization, "MANAGER", "manager");
    const seller = await addMember(tenant.organization, "SELLER", "seller");
    const viewer = await addMember(tenant.organization, "VIEWER", "viewer");

    const created = await putPolicy(tenant.token, "HIGH", {
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
    }).expect(201);
    expect(created.body).toMatchObject({
      priority: "HIGH",
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
      isActive: true,
      version: 1,
    });

    // Edição sem version ou com version velha: 409.
    await putPolicy(manager.token, "HIGH", {
      firstResponseMinutes: 20,
      resolutionMinutes: 120,
    }).expect(409);
    const updated = await putPolicy(manager.token, "HIGH", {
      firstResponseMinutes: 20,
      resolutionMinutes: 120,
      version: 1,
    }).expect(200);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      firstResponseMinutes: 20,
      version: 2,
    });
    await putPolicy(manager.token, "HIGH", {
      firstResponseMinutes: 10,
      resolutionMinutes: 60,
      version: 1,
    }).expect(409);
    // Criação com version informada também é conflito.
    await putPolicy(tenant.token, "LOW", {
      firstResponseMinutes: 60,
      resolutionMinutes: 600,
      version: 3,
    }).expect(409);

    // Validação: prioridade inválida, minutos não positivos, ordem.
    await putPolicy(tenant.token, "CRITICAL", {
      firstResponseMinutes: 1,
      resolutionMinutes: 2,
    }).expect(400);
    await putPolicy(tenant.token, "LOW", {
      firstResponseMinutes: 0,
      resolutionMinutes: 2,
    }).expect(400);
    await putPolicy(tenant.token, "LOW", {
      firstResponseMinutes: 60,
      resolutionMinutes: 30,
    }).expect(400);

    // SELLER e VIEWER não configuram, mas leem.
    await putPolicy(seller.token, "LOW", {
      firstResponseMinutes: 60,
      resolutionMinutes: 600,
    }).expect(403);
    await putPolicy(viewer.token, "LOW", {
      firstResponseMinutes: 60,
      resolutionMinutes: 600,
    }).expect(403);
    const listed = await api()
      .get("/api/v1/sla-policies")
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      priority: "HIGH",
      version: 2,
    });

    const audit = await prisma.withTenant(tenant.organization.id, client =>
      client.auditLog.findMany({
        where: { entityType: "sla_policy" },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    );
    expect(audit.map(entry => entry.action)).toEqual([
      "sla_policy.created",
      "sla_policy.updated",
    ]);
  });

  it("isolates policies between tenants", async () => {
    const tenantA = await createTenant("iso-a");
    const tenantB = await createTenant("iso-b");
    await putPolicy(tenantA.token, "URGENT", {
      firstResponseMinutes: 15,
      resolutionMinutes: 60,
    }).expect(201);
    // Mesma prioridade no tenant B cria outra política (unicidade por org).
    await putPolicy(tenantB.token, "URGENT", {
      firstResponseMinutes: 45,
      resolutionMinutes: 90,
    }).expect(201);

    const listB = await api()
      .get("/api/v1/sla-policies")
      .set("Authorization", `Bearer ${tenantB.token}`)
      .expect(200);
    expect(listB.body.items).toEqual([
      expect.objectContaining({ priority: "URGENT", firstResponseMinutes: 45 }),
    ]);

    // Tenant B abre URGENT e recebe os prazos da própria política.
    const ticket = (
      await openTicket(tenantB.token, {
        subject: "Isolamento",
        priority: "URGENT",
      }).expect(201)
    ).body;
    const opened = new Date(ticket.openedAt).getTime();
    expect(new Date(ticket.firstResponseDueAt).getTime() - opened).toBe(
      45 * MINUTE
    );
  });

  it("sets deadlines on open, keeps null without an active policy and recalculates on priority change", async () => {
    const tenant = await createTenant("deadlines");
    await putPolicy(tenant.token, "HIGH", {
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
    }).expect(201);
    await putPolicy(tenant.token, "LOW", {
      firstResponseMinutes: 120,
      resolutionMinutes: 2880,
      isActive: false,
    }).expect(201);

    const withoutPolicy = (
      await openTicket(tenant.token, {
        subject: "Sem política",
        priority: "MEDIUM",
      }).expect(201)
    ).body;
    expect(withoutPolicy).toMatchObject({
      firstResponseDueAt: null,
      resolutionDueAt: null,
      sla: { firstResponse: null, resolution: null },
    });
    const inactive = (
      await openTicket(tenant.token, {
        subject: "Política inativa",
        priority: "LOW",
      }).expect(201)
    ).body;
    expect(inactive.resolutionDueAt).toBeNull();

    const high = (
      await openTicket(tenant.token, {
        subject: "Alta",
        priority: "HIGH",
      }).expect(201)
    ).body;
    const opened = new Date(high.openedAt).getTime();
    expect(new Date(high.firstResponseDueAt).getTime()).toBe(
      opened + 30 * MINUTE
    );
    expect(new Date(high.resolutionDueAt).getTime()).toBe(
      opened + 240 * MINUTE
    );
    expect(high.sla).toEqual({ firstResponse: "OK", resolution: "OK" });

    // Muda para MEDIUM (sem política): prazos ficam nulos.
    const toMedium = await api()
      .patch(`/api/v1/tickets/${high.id}`)
      .set("Authorization", `Bearer ${tenant.token}`)
      .send({ priority: "MEDIUM", version: 1 })
      .expect(200);
    expect(toMedium.body).toMatchObject({
      firstResponseDueAt: null,
      resolutionDueAt: null,
    });

    // Cria política URGENT depois e muda a prioridade: recalcula a partir
    // de openedAt (não do instante da mudança).
    await putPolicy(tenant.token, "URGENT", {
      firstResponseMinutes: 10,
      resolutionMinutes: 60,
    }).expect(201);
    clockNow = new Date(opened + 5 * MINUTE);
    const toUrgent = await api()
      .patch(`/api/v1/tickets/${high.id}`)
      .set("Authorization", `Bearer ${tenant.token}`)
      .send({ priority: "URGENT", version: 2 })
      .expect(200);
    expect(new Date(toUrgent.body.firstResponseDueAt).getTime()).toBe(
      opened + 10 * MINUTE
    );
    expect(new Date(toUrgent.body.resolutionDueAt).getTime()).toBe(
      opened + 60 * MINUTE
    );

    // Editar outro campo não mexe nos prazos, mesmo com a política alterada.
    await putPolicy(tenant.token, "URGENT", {
      firstResponseMinutes: 5,
      resolutionMinutes: 30,
      version: 1,
    }).expect(200);
    const renamed = await api()
      .patch(`/api/v1/tickets/${high.id}`)
      .set("Authorization", `Bearer ${tenant.token}`)
      .send({ subject: "Renomeada", version: 3 })
      .expect(200);
    expect(renamed.body.resolutionDueAt).toBe(toUrgent.body.resolutionDueAt);

    const events = await api()
      .get(`/api/v1/tickets/${high.id}/events`)
      .set("Authorization", `Bearer ${tenant.token}`)
      .expect(200);
    expect(events.body.items.map((e: { type: string }) => e.type)).toEqual([
      "CREATED",
      "UPDATED",
      "UPDATED",
      "UPDATED",
    ]);
  });

  it("derives OK, AT_RISK, BREACHED, MET and MISSED with an injected clock and keeps the deadline on reopen", async () => {
    const tenant = await createTenant("states");
    await putPolicy(tenant.token, "HIGH", {
      firstResponseMinutes: 100,
      resolutionMinutes: 200,
    }).expect(201);
    const ticket = (
      await openTicket(tenant.token, {
        subject: "Estados",
        priority: "HIGH",
      }).expect(201)
    ).body;
    const opened = new Date(ticket.openedAt).getTime();

    clockNow = new Date(opened + 80 * MINUTE);
    expect(
      (await readTicket(tenant.token, ticket.id).expect(200)).body.sla
    ).toEqual({ firstResponse: "OK", resolution: "OK" });

    clockNow = new Date(opened + 81 * MINUTE);
    expect(
      (await readTicket(tenant.token, ticket.id).expect(200)).body.sla
    ).toEqual({ firstResponse: "AT_RISK", resolution: "OK" });

    clockNow = new Date(opened + 170 * MINUTE);
    const list = await api()
      .get("/api/v1/tickets")
      .set("Authorization", `Bearer ${tenant.token}`)
      .expect(200);
    expect(list.body.items[0].sla).toEqual({
      firstResponse: "BREACHED",
      resolution: "AT_RISK",
    });

    // Marcos controlados: 1ª resposta no limite exato (MET) e resolução
    // 1 minuto depois do prazo (MISSED).
    await prisma.withTenant(tenant.organization.id, client =>
      client.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "RESOLVED",
          firstResponseAt: new Date(opened + 100 * MINUTE),
          resolvedAt: new Date(opened + 201 * MINUTE),
        },
      })
    );
    clockNow = new Date(opened + 300 * MINUTE);
    const resolved = (await readTicket(tenant.token, ticket.id).expect(200))
      .body;
    expect(resolved.sla).toEqual({
      firstResponse: "MET",
      resolution: "MISSED",
    });

    // Reabertura: resolvedAt limpo, prazo de resolução intacto → BREACHED.
    const reopened = await api()
      .post(`/api/v1/tickets/${ticket.id}/status`)
      .set("Authorization", `Bearer ${tenant.token}`)
      .send({ status: "IN_PROGRESS", version: resolved.version })
      .expect(201);
    expect(reopened.body.resolutionDueAt).toBe(ticket.resolutionDueAt);
    expect(reopened.body.sla).toEqual({
      firstResponse: "MET",
      resolution: "BREACHED",
    });
  });
});

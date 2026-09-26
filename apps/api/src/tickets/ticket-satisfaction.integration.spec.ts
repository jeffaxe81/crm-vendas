import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import {
  TicketSatisfactionService,
  hashSatisfactionToken,
} from "./ticket-satisfaction.service";

const PASSWORD = "Strong-Satisfaction-Password-2026!";

describe("C5.4 ticket satisfaction (CSAT)", () => {
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
         ticket_satisfaction_surveys,
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

  async function login(email: string, organizationSlug: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD, organizationSlug })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function addMember(
    organization: { id: string; slug: string },
    role: "ADMIN" | "MANAGER" | "SELLER" | "VIEWER",
    suffix: string
  ) {
    const email = `csat-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `CSAT ${suffix}`,
        passwordHash: await passwords.hash(PASSWORD),
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    return { user, token: await login(email, organization.slug) };
  }

  async function createSession(
    role: "ADMIN" | "MANAGER" | "SELLER" | "VIEWER",
    suffix: string
  ) {
    const organization = await prisma.organization.create({
      data: { name: `Organização ${suffix}`, slug: `csat-${suffix}` },
    });
    const member = await addMember(organization, role, suffix);
    return { organization, ...member };
  }

  const api = () => request(app.getHttpServer());

  async function openTicket(token: string, subject: string) {
    const response = await api()
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject })
      .expect(201);
    return response.body as { id: string; protocol: string; version: number };
  }

  function changeStatus(
    token: string,
    id: string,
    status: string,
    version: number
  ) {
    return api()
      .post(`/api/v1/tickets/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status, version })
      .expect(201);
  }

  function tokenFrom(url: string): string {
    const match = /\/avaliacao\/([A-Za-z0-9_-]{43})$/.exec(url);
    if (!match?.[1]) {
      throw new Error(`Unexpected satisfaction URL: ${url}`);
    }
    return match[1];
  }

  /** Abre e resolve uma solicitação; devolve o token público gerado. */
  async function resolvedTicket(token: string, subject: string) {
    const ticket = await openTicket(token, subject);
    const resolved = await changeStatus(token, ticket.id, "RESOLVED", 1);
    return {
      ticket,
      version: resolved.body.version as number,
      customerToken: tokenFrom(resolved.body.satisfactionLink.url),
    };
  }

  it("creates one survey on the first resolution and never on re-resolution", async () => {
    const { organization, token } = await createSession("ADMIN", "auto");
    const ticket = await openTicket(token, "Ramal mudo");

    const beforeResolution = await api()
      .get(`/api/v1/tickets/${ticket.id}/satisfaction`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(beforeResolution.body).toEqual({ survey: null });

    const inProgress = await changeStatus(token, ticket.id, "IN_PROGRESS", 1);
    expect(inProgress.body).not.toHaveProperty("satisfactionLink");

    const resolved = await changeStatus(token, ticket.id, "RESOLVED", 2);
    expect(resolved.body).toMatchObject({ status: "RESOLVED", version: 3 });
    const link = resolved.body.satisfactionLink as {
      url: string;
      expiresAt: string;
    };
    expect(link.url.startsWith(`${process.env.WEB_ORIGIN}/avaliacao/`)).toBe(
      true
    );
    const customerToken = tokenFrom(link.url);
    const ttl = new Date(link.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(7 * 24 * 3600 * 1000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);

    const stored = await prisma.ticketSatisfactionSurvey.findMany({
      where: { ticketId: ticket.id },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashSatisfactionToken(customerToken));
    expect(stored[0]?.tokenHash).not.toContain(customerToken);

    const state = await api()
      .get(`/api/v1/tickets/${ticket.id}/satisfaction`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(state.body.survey).toMatchObject({
      ticketId: ticket.id,
      state: "PENDING",
      rating: null,
      comment: null,
      respondedAt: null,
      version: 1,
    });
    expect(JSON.stringify(state.body)).not.toContain(customerToken);
    expect(state.body.survey).not.toHaveProperty("tokenHash");

    await changeStatus(token, ticket.id, "IN_PROGRESS", 3);
    const again = await changeStatus(token, ticket.id, "RESOLVED", 4);
    expect(again.body).not.toHaveProperty("satisfactionLink");
    expect(
      await prisma.ticketSatisfactionSurvey.count({
        where: { ticketId: ticket.id },
      })
    ).toBe(1);

    // O link original continua válido após reabrir e resolver de novo.
    await api().get(`/api/v1/public/satisfaction/${customerToken}`).expect(200);

    const audits = await prisma.auditLog.findMany({
      where: {
        organizationId: organization.id,
        entityType: "ticket_satisfaction_survey",
      },
    });
    expect(audits.map(audit => audit.action)).toEqual([
      "ticket.satisfaction_created",
    ]);
  });

  it("regenerates the link once, invalidating the previous token", async () => {
    const admin = await createSession("ADMIN", "link");
    const viewer = await addMember(admin.organization, "VIEWER", "link-viewer");
    const { ticket, customerToken } = await resolvedTicket(
      admin.token,
      "Troca de aparelho"
    );

    await api()
      .get(`/api/v1/tickets/${ticket.id}/satisfaction`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({})
      .expect(403);

    await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ version: 7 })
      .expect(409);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ token: "x" })
      .expect(400);

    const regenerated = await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ version: 1 })
      .expect(201);
    expect(regenerated.body.survey).toMatchObject({
      state: "PENDING",
      version: 2,
    });
    const newToken = tokenFrom(regenerated.body.link.url);
    expect(newToken).not.toBe(customerToken);

    await api().get(`/api/v1/public/satisfaction/${customerToken}`).expect(404);
    await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .send({ rating: 5 })
      .expect(404);
    await api().get(`/api/v1/public/satisfaction/${newToken}`).expect(200);

    // Sem versão também funciona e gera mais um token.
    const third = await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({})
      .expect(201);
    await api().get(`/api/v1/public/satisfaction/${newToken}`).expect(404);
    expect(third.body.survey.version).toBe(3);

    const actions = await prisma.auditLog.findMany({
      where: { organizationId: admin.organization.id },
      select: { action: true },
    });
    expect(
      actions.filter(
        item => item.action === "ticket.satisfaction_link_generated"
      )
    ).toHaveLength(2);
  });

  it("rejects link generation before resolution and while reopened", async () => {
    const { token } = await createSession("SELLER", "unavailable");
    const open = await openTicket(token, "Sem resolução");
    await api()
      .post(`/api/v1/tickets/${open.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(404);

    const { ticket, version } = await resolvedTicket(token, "Reaberta");
    await changeStatus(token, ticket.id, "IN_PROGRESS", version);
    const reopened = await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
    expect(reopened.body.code).toBe("TICKET_SATISFACTION_UNAVAILABLE");

    const other = await createSession("ADMIN", "unavailable-other");
    await api()
      .get(`/api/v1/tickets/${ticket.id}/satisfaction`)
      .set("Authorization", `Bearer ${other.token}`)
      .expect(404);
    await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({})
      .expect(404);
  });

  it("runs the public flow once, with timeline event and audit", async () => {
    const { organization, token } = await createSession("ADMIN", "public");
    const { ticket, customerToken } = await resolvedTicket(
      token,
      "Fatura duplicada"
    );

    const page = await api()
      .get(`/api/v1/public/satisfaction/${customerToken}`)
      .expect(200);
    expect(Object.keys(page.body).sort()).toEqual([
      "expiresAt",
      "organizationName",
      "protocol",
      "subject",
    ]);
    expect(page.body).toMatchObject({
      protocol: ticket.protocol,
      subject: "Fatura duplicada",
      organizationName: "Organização public",
    });

    await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .send({ rating: 6 })
      .expect(400);
    await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .send({ rating: 4, comment: "x".repeat(2001) })
      .expect(400);
    await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .send({ rating: 4, organizationId: organization.id })
      .expect(400);

    const answered = await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .set("x-request-id", "c5-4-public-answer")
      .send({ rating: 4, comment: "Resolvido rápido" })
      .expect(201);
    expect(answered.body.rating).toBe(4);

    const second = await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .send({ rating: 1 })
      .expect(409);
    expect(second.body.code).toBe("SATISFACTION_ALREADY_RESPONDED");
    await api().get(`/api/v1/public/satisfaction/${customerToken}`).expect(409);

    const state = await api()
      .get(`/api/v1/tickets/${ticket.id}/satisfaction`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(state.body.survey).toMatchObject({
      state: "RESPONDED",
      rating: 4,
      comment: "Resolvido rápido",
    });
    expect(state.body.survey.respondedAt).not.toBeNull();

    await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(409);

    const events = await api()
      .get(`/api/v1/tickets/${ticket.id}/events`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const last = events.body.items.at(-1);
    expect(last).toMatchObject({
      type: "COMMENT",
      isInternal: true,
      metadata: { source: "CUSTOMER_SATISFACTION", rating: 4 },
    });
    expect(last.body.startsWith("Avaliação do cliente: 4/5")).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: organization.id,
        action: "ticket.satisfaction_responded",
      },
    });
    expect(audit).toMatchObject({
      actorUserId: null,
      requestId: "c5-4-public-answer",
      entityType: "ticket_satisfaction_survey",
      after: { rating: 4, hasComment: true },
    });
  });

  it("answers invalid, foreign-looking and expired tokens without leaking", async () => {
    const { token } = await createSession("ADMIN", "invalid");
    const { ticket, customerToken } = await resolvedTicket(token, "Expira");

    const malformed = await api()
      .get("/api/v1/public/satisfaction/nao-e-um-token")
      .expect(404);
    const unknown = await api()
      .get(`/api/v1/public/satisfaction/${"A".repeat(43)}`)
      .expect(404);
    expect(malformed.body.code).toBe("SATISFACTION_NOT_FOUND");
    expect(unknown.body).toMatchObject({
      code: malformed.body.code,
      message: malformed.body.message,
    });
    await api()
      .post(`/api/v1/public/satisfaction/${"A".repeat(43)}`)
      .send({ rating: 3 })
      .expect(404);

    await prisma.ticketSatisfactionSurvey.updateMany({
      where: { ticketId: ticket.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await api()
      .get(`/api/v1/public/satisfaction/${customerToken}`)
      .expect(410);
    expect(expired.body.code).toBe("SATISFACTION_EXPIRED");
    await api()
      .post(`/api/v1/public/satisfaction/${customerToken}`)
      .send({ rating: 3 })
      .expect(410);

    const state = await api()
      .get(`/api/v1/tickets/${ticket.id}/satisfaction`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(state.body.survey.state).toBe("EXPIRED");

    const renewed = await api()
      .post(`/api/v1/tickets/${ticket.id}/satisfaction/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(renewed.body.survey.state).toBe("PENDING");
    await api()
      .get(`/api/v1/public/satisfaction/${tokenFrom(renewed.body.link.url)}`)
      .expect(200);
  });

  it("isolates tenants under the RLS application role", async () => {
    const tenantA = await createSession("ADMIN", "rls-a");
    const tenantB = await createSession("ADMIN", "rls-b");
    const a = await resolvedTicket(tenantA.token, "Chamado A");
    const b = await resolvedTicket(tenantB.token, "Chamado B");

    const rls = new PrismaService(process.env.RLS_DATABASE_URL);
    try {
      const role = await rls.$queryRaw<
        { rolsuper: boolean; rolbypassrls: boolean }[]
      >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
      expect(role).toEqual([{ rolsuper: false, rolbypassrls: false }]);

      // Sem contexto nenhum: nada visível.
      expect(await rls.ticketSatisfactionSurvey.count()).toBe(0);

      // Só o hash do token A: exatamente a pesquisa A, leitura apenas.
      const hashA = hashSatisfactionToken(a.customerToken);
      const lookup = await rls.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('app.satisfaction_token_hash', ${hashA}, true)`;
        const rows = await tx.ticketSatisfactionSurvey.findMany({
          select: { organizationId: true, ticketId: true },
        });
        const tickets = await tx.ticket.count();
        const updated = await tx.ticketSatisfactionSurvey.updateMany({
          data: { rating: 1, respondedAt: new Date() },
        });
        return { rows, tickets, updated: updated.count };
      });
      expect(lookup).toEqual({
        rows: [
          { organizationId: tenantA.organization.id, ticketId: a.ticket.id },
        ],
        tickets: 0,
        updated: 0,
      });

      // Contexto do tenant A não enxerga a pesquisa do tenant B.
      const fromA = await rls.withTenant(tenantA.organization.id, tenant =>
        tenant.ticketSatisfactionSurvey.findMany({ select: { ticketId: true } })
      );
      expect(fromA).toEqual([{ ticketId: a.ticket.id }]);

      // Fluxo público completo pela role de aplicação.
      const service = new TicketSatisfactionService(rls, new AuditService(rls));
      await expect(service.readPublic(a.customerToken)).resolves.toMatchObject({
        protocol: a.ticket.protocol,
        subject: "Chamado A",
        organizationName: "Organização rls-a",
      });
      await expect(
        service.respondPublic(
          b.customerToken,
          { rating: 2 },
          {
            requestId: "c5-4-rls",
          }
        )
      ).resolves.toMatchObject({ rating: 2 });
      await expect(
        service.readPublic(`${a.customerToken.slice(0, 42)}x`)
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await rls.onModuleDestroy();
    }

    const surveys = await prisma.ticketSatisfactionSurvey.findMany({
      orderBy: { createdAt: "asc" },
      select: { ticketId: true, rating: true },
    });
    expect(surveys).toEqual([
      { ticketId: a.ticket.id, rating: null },
      { ticketId: b.ticket.id, rating: 2 },
    ]);
    const eventsA = await prisma.ticketEvent.count({
      where: { ticketId: a.ticket.id, type: "COMMENT" },
    });
    const eventsB = await prisma.ticketEvent.findMany({
      where: { ticketId: b.ticket.id, type: "COMMENT" },
    });
    expect(eventsA).toBe(0);
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0]?.organizationId).toBe(tenantB.organization.id);
  });

  it("reports CSAT for the tenant and period", async () => {
    const admin = await createSession("ADMIN", "report");
    const seller = await addMember(
      admin.organization,
      "SELLER",
      "report-seller"
    );
    const other = await createSession("ADMIN", "report-other");

    const five = await resolvedTicket(admin.token, "Nota cinco");
    const two = await resolvedTicket(admin.token, "Nota dois");
    const four = await resolvedTicket(admin.token, "Nota quatro antiga");
    await resolvedTicket(admin.token, "Sem resposta");
    await openTicket(admin.token, "Nunca resolvida");
    const foreign = await resolvedTicket(other.token, "Outro tenant");

    for (const [item, rating] of [
      [five, 5],
      [two, 2],
      [four, 4],
      [foreign, 1],
    ] as const) {
      await api()
        .post(`/api/v1/public/satisfaction/${item.customerToken}`)
        .send({ rating })
        .expect(201);
    }
    await prisma.ticketSatisfactionSurvey.updateMany({
      where: { ticketId: four.ticket.id },
      data: { createdAt: new Date("2026-01-10T12:00:00.000Z") },
    });

    const all = await api()
      .get("/api/v1/reports/csat")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(all.body).toMatchObject({
      filters: { from: null, to: null },
      sent: 4,
      responded: 3,
      responseRate: 0.75,
      averageRating: 11 / 3,
      distribution: { "1": 0, "2": 1, "3": 0, "4": 1, "5": 1 },
      csat: 2 / 3,
    });

    const period = await api()
      .get("/api/v1/reports/csat?from=2026-02-01T00:00:00.000Z")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(period.body).toMatchObject({
      sent: 3,
      responded: 2,
      averageRating: 3.5,
      csat: 0.5,
      distribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 1 },
    });

    const empty = await api()
      .get(
        "/api/v1/reports/csat?from=2025-01-01T00:00:00.000Z&to=2025-12-31T23:59:59.999Z"
      )
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(empty.body).toMatchObject({
      sent: 0,
      responded: 0,
      responseRate: null,
      averageRating: null,
      csat: null,
    });

    await api()
      .get(
        "/api/v1/reports/csat?from=2026-12-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z"
      )
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(400);
    await api()
      .get(`/api/v1/reports/csat?organizationId=${other.organization.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(400);
    await api()
      .get("/api/v1/reports/csat")
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(403);
    await api().get("/api/v1/reports/csat").expect(401);
  });
});

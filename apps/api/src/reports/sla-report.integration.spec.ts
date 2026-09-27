import { SlaReportSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { SLA_CLOCK } from "../sla/sla-clock";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Status =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

const URL = "/api/v1/reports/sla";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const PASSWORD = "Strong-Sla-Report-Password-2026!";

const at = (value: string) => new Date(value);

describe("C5.3 SLA report API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SLA_CLOCK)
      .useValue(() => new Date(NOW.getTime()))
      .compile();

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

  async function createSession(role: MembershipRole, suffix: string) {
    const organization = await prisma.organization.create({
      data: { name: `SLA report ${suffix}`, slug: `sla-report-${suffix}` },
    });
    const email = `sla-report-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `SLA report ${suffix}`,
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
    return {
      organization,
      user,
      token: login.body.accessToken as string,
    };
  }

  let sequence = 0;

  async function seedTicket(
    session: { organization: { id: string }; user: { id: string } },
    input: {
      priority: Priority;
      status: Status;
      openedAt: string;
      firstResponseDueAt?: string;
      resolutionDueAt?: string;
      firstResponseAt?: string;
      resolvedAt?: string;
      deleted?: boolean;
    }
  ) {
    sequence += 1;
    const organizationId = session.organization.id;
    await prisma.withTenant(organizationId, tenant =>
      tenant.ticket.create({
        data: {
          organizationId,
          protocol: `2026-${String(sequence).padStart(6, "0")}`,
          subject: `Ticket ${sequence}`,
          priority: input.priority,
          status: input.status,
          openedAt: at(input.openedAt),
          firstResponseDueAt: input.firstResponseDueAt
            ? at(input.firstResponseDueAt)
            : null,
          resolutionDueAt: input.resolutionDueAt
            ? at(input.resolutionDueAt)
            : null,
          firstResponseAt: input.firstResponseAt
            ? at(input.firstResponseAt)
            : null,
          resolvedAt: input.resolvedAt ? at(input.resolvedAt) : null,
          ...(input.deleted
            ? { deletedAt: NOW, deletedBy: session.user.id }
            : {}),
          createdBy: session.user.id,
          updatedBy: session.user.id,
        },
      })
    );
  }

  async function seedScenario() {
    const admin = await createSession("ADMIN", "a");
    // HIGH: 1ª resposta e resolução no prazo.
    await seedTicket(admin, {
      priority: "HIGH",
      status: "RESOLVED",
      openedAt: "2026-09-10T10:00:00Z",
      firstResponseDueAt: "2026-09-10T10:30:00Z",
      firstResponseAt: "2026-09-10T10:30:00Z",
      resolutionDueAt: "2026-09-10T14:00:00Z",
      resolvedAt: "2026-09-10T13:00:00Z",
    });
    // HIGH: 1ª resposta atrasada, resolução vencida em aberto.
    await seedTicket(admin, {
      priority: "HIGH",
      status: "IN_PROGRESS",
      openedAt: "2026-09-10T11:00:00Z",
      firstResponseDueAt: "2026-09-10T11:30:00Z",
      firstResponseAt: "2026-09-10T12:00:00Z",
      resolutionDueAt: "2026-09-10T15:00:00Z",
    });
    // HIGH: ainda dentro do prazo, sem resultado.
    await seedTicket(admin, {
      priority: "HIGH",
      status: "OPEN",
      openedAt: "2026-09-15T11:50:00Z",
      firstResponseDueAt: "2026-09-15T12:20:00Z",
      resolutionDueAt: "2026-09-15T15:50:00Z",
    });
    // URGENT fora do período, vencido em aberto agora.
    await seedTicket(admin, {
      priority: "URGENT",
      status: "OPEN",
      openedAt: "2026-09-01T09:00:00Z",
      firstResponseDueAt: "2026-09-01T09:15:00Z",
      resolutionDueAt: "2026-09-01T10:00:00Z",
    });
    // URGENT cancelada: resolução não é avaliada.
    await seedTicket(admin, {
      priority: "URGENT",
      status: "CANCELLED",
      openedAt: "2026-09-10T09:00:00Z",
      firstResponseDueAt: "2026-09-10T09:15:00Z",
      firstResponseAt: "2026-09-10T09:05:00Z",
      resolutionDueAt: "2026-09-10T10:00:00Z",
    });
    // MEDIUM sem política (prazos nulos).
    await seedTicket(admin, {
      priority: "MEDIUM",
      status: "OPEN",
      openedAt: "2026-09-10T09:00:00Z",
    });
    // Excluída logicamente: fora do relatório.
    await seedTicket(admin, {
      priority: "HIGH",
      status: "OPEN",
      openedAt: "2026-09-10T09:00:00Z",
      firstResponseDueAt: "2026-09-10T09:30:00Z",
      resolutionDueAt: "2026-09-10T10:00:00Z",
      deleted: true,
    });

    // Outro tenant com solicitação vencida: não pode vazar.
    const other = await createSession("ADMIN", "b");
    await seedTicket(other, {
      priority: "HIGH",
      status: "OPEN",
      openedAt: "2026-09-10T09:00:00Z",
      firstResponseDueAt: "2026-09-10T09:30:00Z",
      resolutionDueAt: "2026-09-10T10:00:00Z",
    });
    return admin;
  }

  it("aggregates SLA compliance per priority for the period", async () => {
    const admin = await seedScenario();

    const response = await api()
      .get(`${URL}?from=2026-09-05T00:00:00Z&to=2026-09-15T23:59:59Z`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    const report = SlaReportSchema.parse(response.body);

    expect(report.asOf).toBe(NOW.toISOString());
    expect(report.filters).toEqual({
      from: "2026-09-05T00:00:00.000Z",
      to: "2026-09-15T23:59:59.000Z",
    });
    expect(report.items.map(item => item.priority)).toEqual([
      "URGENT",
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);
    const byPriority = Object.fromEntries(
      report.items.map(item => [item.priority, item])
    );
    expect(byPriority.HIGH).toMatchObject({
      opened: 3,
      firstResponseEvaluated: 2,
      firstResponseOnTime: 1,
      firstResponseRate: 0.5,
      resolutionEvaluated: 2,
      resolutionOnTime: 1,
      resolutionRate: 0.5,
      breachedOpen: 1,
    });
    expect(byPriority.URGENT).toMatchObject({
      opened: 1,
      firstResponseEvaluated: 1,
      firstResponseOnTime: 1,
      firstResponseRate: 1,
      resolutionEvaluated: 0,
      resolutionRate: null,
      breachedOpen: 1,
    });
    expect(byPriority.MEDIUM).toMatchObject({
      opened: 1,
      firstResponseRate: null,
      resolutionRate: null,
      breachedOpen: 0,
    });
    expect(byPriority.LOW).toMatchObject({ opened: 0, breachedOpen: 0 });
    expect(report.totals).toMatchObject({
      opened: 5,
      firstResponseEvaluated: 3,
      firstResponseOnTime: 2,
      resolutionEvaluated: 2,
      resolutionOnTime: 1,
      resolutionRate: 0.5,
      breachedOpen: 2,
    });
    expect(report.totals.firstResponseRate).toBeCloseTo(2 / 3);

    const all = SlaReportSchema.parse(
      (
        await api()
          .get(URL)
          .set("Authorization", `Bearer ${admin.token}`)
          .expect(200)
      ).body
    );
    const urgent = all.items.find(item => item.priority === "URGENT");
    expect(urgent).toMatchObject({
      opened: 2,
      firstResponseEvaluated: 2,
      firstResponseOnTime: 1,
      resolutionEvaluated: 1,
      resolutionOnTime: 0,
      breachedOpen: 1,
    });
    expect(all.totals.opened).toBe(6);
  });

  it("requires reports.read and validates the query", async () => {
    const seller = await createSession("SELLER", "seller");
    await api()
      .get(URL)
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(403);
    await api().get(URL).expect(401);

    const manager = await createSession("MANAGER", "manager");
    await api()
      .get(`${URL}?from=2026-09-10T00:00:00Z&to=2026-09-01T00:00:00Z`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(400);
    await api()
      .get(`${URL}?priority=HIGH`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(400);
    const empty = await api()
      .get(URL)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(200);
    expect(empty.body.totals).toMatchObject({
      opened: 0,
      firstResponseRate: null,
      breachedOpen: 0,
    });
  });
});

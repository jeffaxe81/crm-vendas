import { ActivitiesByOwnerReportSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { ACTIVITIES_BY_OWNER_CLOCK } from "./activities-by-owner.service";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const URL = "/api/v1/reports/activities-by-owner";
const NOW = new Date("2026-09-15T12:00:00.000Z");

const at = (value: string) => new Date(value);

describe("C4.4.3 activities by owner report API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let clockNow = NOW;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ACTIVITIES_BY_OWNER_CLOCK)
      .useValue(() => new Date(clockNow.getTime()))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => {
    clockNow = NOW;
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

  async function createUser(
    email: string,
    password: string,
    displayName: string
  ) {
    return prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        displayName,
        passwordHash: await passwords.hash(password),
      },
    });
  }

  async function login(
    email: string,
    password: string,
    organizationSlug: string
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug })
      .expect(200);

    return response.body.accessToken as string;
  }

  async function createFixture(suffix: string) {
    const organization = await prisma.organization.create({
      data: {
        name: `Activities By Owner Organization ${suffix}`,
        slug: `activities-by-owner-${suffix}`,
      },
    });
    const password = "Strong-Activities-By-Owner-Password-2026!";
    const user = await createUser(
      `activities-by-owner-admin-${suffix}@example.test`,
      password,
      `Ana Admin ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Activities By Owner ${suffix}`,
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const token = await login(user.email, password, organization.slug);

    return { organization, user, company, token };
  }

  type Fixture = Awaited<ReturnType<typeof createFixture>>;

  async function addMember(
    fixture: Fixture,
    role: MembershipRole,
    suffix: string,
    options: { isActive?: boolean; displayName?: string } = {}
  ) {
    const password = `Strong-${role}-Password-2026!`;
    const user = await createUser(
      `activities-by-owner-${role.toLowerCase()}-${suffix}@example.test`,
      password,
      options.displayName ?? `${role} ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: {
        organizationId: fixture.organization.id,
        userId: user.id,
        role,
        isActive: options.isActive ?? true,
      },
    });

    return {
      user,
      token:
        options.isActive === false
          ? ""
          : await login(user.email, password, fixture.organization.slug),
    };
  }

  type ActivitySeed = {
    owner: string;
    type?: "TASK" | "APPOINTMENT";
    status?: "PENDING" | "COMPLETED" | "CANCELLED";
    dueAt?: Date | null;
    completedAt?: Date | null;
    deleted?: boolean;
  };

  async function seedActivities(fixture: Fixture, seeds: ActivitySeed[]) {
    const organizationId = fixture.organization.id;
    const author = fixture.user.id;
    await prisma.withTenant(organizationId, tenant =>
      tenant.activity.createMany({
        data: seeds.map((seed, index) => ({
          organizationId,
          type: seed.type ?? "TASK",
          status: seed.status ?? "PENDING",
          title: `Atividade ${index + 1}`,
          companyId: fixture.company.id,
          ownerUserId: seed.owner,
          dueAt: seed.dueAt ?? null,
          completedAt: seed.completedAt ?? null,
          cancelledAt: seed.status === "CANCELLED" ? at("2026-09-02") : null,
          createdBy: author,
          updatedBy: author,
          deletedAt: seed.deleted ? at("2026-09-03") : null,
          deletedBy: seed.deleted ? author : null,
        })),
      })
    );
  }

  /**
   * Cenário base (agora = 15/09/2026 12:00 UTC):
   * - Ana (admin): 2 concluídas (1 no prazo, 1 atrasada), 1 compromisso
   *   pendente vencido, 1 pendente futura, 1 cancelada vencida, 1 pendente
   *   sem prazo, 1 pendente vencendo exatamente agora e 1 excluída;
   * - Bruno (vendedor): 3 compromissos concluídos exatamente no prazo;
   * - Duda (membership desativada): 1 pendente vencida;
   * - usuário sem membership na organização: 1 pendente (fica de fora).
   */
  async function createScenario(fixture: Fixture) {
    const seller = await addMember(fixture, "SELLER", "scenario", {
      displayName: "Bruno Vendedor",
    });
    const inactive = await addMember(fixture, "SELLER", "inactive", {
      isActive: false,
      displayName: "Duda Inativa",
    });
    const outsider = await createUser(
      "activities-by-owner-outsider@example.test",
      "Strong-Outsider-Password-2026!",
      "Fora da Organização"
    );
    const ana = fixture.user.id;

    await seedActivities(fixture, [
      {
        owner: ana,
        status: "COMPLETED",
        dueAt: at("2026-09-10T12:00:00Z"),
        completedAt: at("2026-09-09T12:00:00Z"),
      },
      {
        owner: ana,
        status: "COMPLETED",
        dueAt: at("2026-09-10T12:00:00Z"),
        completedAt: at("2026-09-12T12:00:00Z"),
      },
      {
        owner: ana,
        type: "APPOINTMENT",
        dueAt: at("2026-09-14T12:00:00Z"),
      },
      { owner: ana, dueAt: at("2026-09-20T12:00:00Z") },
      {
        owner: ana,
        status: "CANCELLED",
        dueAt: at("2026-09-01T12:00:00Z"),
      },
      { owner: ana, dueAt: null },
      { owner: ana, dueAt: NOW },
      {
        owner: ana,
        status: "COMPLETED",
        dueAt: at("2026-09-10T12:00:00Z"),
        completedAt: at("2026-09-09T12:00:00Z"),
        deleted: true,
      },
      ...[1, 2, 3].map(() => ({
        owner: seller.user.id,
        type: "APPOINTMENT" as const,
        status: "COMPLETED" as const,
        dueAt: at("2026-09-05T12:00:00Z"),
        completedAt: at("2026-09-05T12:00:00Z"),
      })),
      { owner: inactive.user.id, dueAt: at("2026-09-01T12:00:00Z") },
      { owner: outsider.id, dueAt: at("2026-09-01T12:00:00Z") },
    ]);

    return { seller, inactive, outsider };
  }

  async function getReport(token: string, query = "") {
    const response = await request(app.getHttpServer())
      .get(`${URL}${query}`)
      .set("Authorization", `Bearer ${token}`)
      .expect("Content-Type", /json/)
      .expect(200);
    return ActivitiesByOwnerReportSchema.parse(response.body);
  }

  it("returns an empty schema-valid report", async () => {
    const fixture = await createFixture("empty");

    const report = await getReport(fixture.token);

    expect(report).toEqual({
      asOf: NOW.toISOString(),
      filters: { from: null, to: null, type: null },
      items: [],
      totals: {
        total: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
        overdue: 0,
        completedOnTime: 0,
        completionRate: null,
        byType: { TASK: 0, APPOINTMENT: 0 },
      },
    });
  });

  it("counts by status, overdue with a fixed clock and on-time completions per owner", async () => {
    const fixture = await createFixture("counts");
    const { seller, inactive, outsider } = await createScenario(fixture);

    const report = await getReport(fixture.token);

    expect(report.asOf).toBe(NOW.toISOString());
    expect(report.items.map(item => item.ownerUserId)).toEqual([
      seller.user.id,
      fixture.user.id,
      inactive.user.id,
    ]);
    expect(report.items.some(item => item.ownerUserId === outsider.id)).toBe(
      false
    );

    expect(report.items[0]).toEqual({
      ownerUserId: seller.user.id,
      ownerDisplayName: "Bruno Vendedor",
      ownerActive: true,
      total: 3,
      completed: 3,
      pending: 0,
      cancelled: 0,
      overdue: 0,
      completedOnTime: 3,
      completionRate: 1,
      byType: { TASK: 0, APPOINTMENT: 3 },
    });
    expect(report.items[1]).toEqual({
      ownerUserId: fixture.user.id,
      ownerDisplayName: "Ana Admin counts",
      ownerActive: true,
      total: 7,
      completed: 2,
      pending: 4,
      cancelled: 1,
      overdue: 1,
      completedOnTime: 1,
      completionRate: 2 / 7,
      byType: { TASK: 6, APPOINTMENT: 1 },
    });
    expect(report.items[2]).toMatchObject({
      ownerUserId: inactive.user.id,
      ownerDisplayName: "Duda Inativa",
      ownerActive: false,
      total: 1,
      completed: 0,
      pending: 1,
      overdue: 1,
      completionRate: 0,
    });
    expect(report.totals).toEqual({
      total: 11,
      completed: 5,
      pending: 5,
      cancelled: 1,
      overdue: 2,
      completedOnTime: 4,
      completionRate: 5 / 11,
      byType: { TASK: 7, APPOINTMENT: 4 },
    });

    // Avançar o relógio injetado torna a pendente futura e a que vencia
    // "agora" atrasadas; canceladas e concluídas nunca contam como atrasadas.
    clockNow = at("2026-09-21T00:00:00Z");
    const later = await getReport(fixture.token);
    expect(later.asOf).toBe("2026-09-21T00:00:00.000Z");
    expect(
      later.items.find(item => item.ownerUserId === fixture.user.id)?.overdue
    ).toBe(3);
    expect(later.totals.overdue).toBe(4);
  });

  it("applies inclusive period filters on dueAt, the type filter and both combined", async () => {
    const fixture = await createFixture("filters");
    const { seller } = await createScenario(fixture);
    const from = "2026-09-10T00:00:00.000Z";
    const to = "2026-09-15T12:00:00.000Z";

    const period = await getReport(
      fixture.token,
      `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    expect(period.filters).toEqual({ from, to, type: null });
    expect(period.items).toHaveLength(1);
    expect(period.items[0]).toMatchObject({
      ownerUserId: fixture.user.id,
      total: 4,
      completed: 2,
      pending: 2,
      cancelled: 0,
      overdue: 1,
      completedOnTime: 1,
      completionRate: 0.5,
      byType: { TASK: 3, APPOINTMENT: 1 },
    });

    // Com período, atividades sem prazo ficam de fora; limites com fuso.
    const openEnded = await getReport(
      fixture.token,
      `?from=${encodeURIComponent("2026-09-01T09:00:00-03:00")}`
    );
    expect(openEnded.filters.from).toBe("2026-09-01T12:00:00.000Z");
    expect(openEnded.totals.total).toBe(10);
    expect(
      openEnded.items.find(item => item.ownerUserId === fixture.user.id)?.total
    ).toBe(6);

    const appointments = await getReport(fixture.token, "?type=APPOINTMENT");
    expect(appointments.filters.type).toBe("APPOINTMENT");
    expect(appointments.items.map(item => item.ownerUserId)).toEqual([
      seller.user.id,
      fixture.user.id,
    ]);
    expect(appointments.items[1]).toMatchObject({
      total: 1,
      pending: 1,
      overdue: 1,
      completionRate: 0,
      byType: { TASK: 0, APPOINTMENT: 1 },
    });

    const combined = await getReport(
      fixture.token,
      `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&type=TASK`
    );
    expect(combined.items).toHaveLength(1);
    expect(combined.items[0]).toMatchObject({
      ownerUserId: fixture.user.id,
      total: 3,
      completed: 2,
      pending: 1,
      overdue: 0,
      byType: { TASK: 3, APPOINTMENT: 0 },
    });
  });

  it("isolates tenants, including a user who belongs to both organizations", async () => {
    const fixture = await createFixture("tenant-a");
    await createScenario(fixture);
    const other = await createFixture("tenant-b");
    // Ana também é membro da outra organização e tem atividades lá.
    await prisma.organizationMembership.create({
      data: {
        organizationId: other.organization.id,
        userId: fixture.user.id,
        role: "SELLER",
      },
    });
    await seedActivities(other, [
      { owner: other.user.id, status: "COMPLETED", dueAt: NOW },
      { owner: fixture.user.id, dueAt: at("2026-09-01T12:00:00Z") },
      { owner: fixture.user.id, dueAt: at("2026-09-01T12:00:00Z") },
    ]);

    const report = await getReport(fixture.token);
    expect(report.totals.total).toBe(11);
    expect(report.items.some(item => item.ownerUserId === other.user.id)).toBe(
      false
    );
    expect(
      report.items.find(item => item.ownerUserId === fixture.user.id)?.total
    ).toBe(7);

    const otherReport = await getReport(other.token);
    expect(otherReport.totals.total).toBe(3);
    expect(otherReport.items.map(item => item.ownerUserId).sort()).toEqual(
      [other.user.id, fixture.user.id].sort()
    );
    expect(
      otherReport.items.find(item => item.ownerUserId === fixture.user.id)
    ).toMatchObject({ total: 2, overdue: 2, completed: 0 });
  });

  it("enforces reports.read and rejects invalid or tenant-injection queries", async () => {
    const fixture = await createFixture("rbac");
    const manager = await addMember(fixture, "MANAGER", "rbac");
    const seller = await addMember(fixture, "SELLER", "rbac");
    const viewer = await addMember(fixture, "VIEWER", "rbac");
    const other = await createFixture("rbac-other");

    for (const token of [fixture.token, manager.token]) {
      await request(app.getHttpServer())
        .get(URL)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    }
    for (const token of [seller.token, viewer.token]) {
      await request(app.getHttpServer())
        .get(URL)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    }
    await request(app.getHttpServer()).get(URL).expect(401);

    for (const query of [
      `?organizationId=${other.organization.id}`,
      "?type=CALL",
      "?from=2026-09-01",
      "?from=2026-09-30T00:00:00Z&to=2026-09-01T00:00:00Z",
      `?ownerUserId=${fixture.user.id}`,
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${URL}${query}`)
        .set("Authorization", `Bearer ${fixture.token}`)
        .expect(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 5xx instead of silent zeroes when the database read fails", async () => {
    const fixture = await createFixture("database-error");
    const originalWithTenant = prisma.withTenant;
    prisma.withTenant = (() =>
      Promise.reject(
        new Error("forced activities by owner database error")
      )) as typeof prisma.withTenant;

    try {
      await request(app.getHttpServer())
        .get(URL)
        .set("Authorization", `Bearer ${fixture.token}`)
        .expect(500);
    } finally {
      prisma.withTenant = originalWithTenant;
    }
  });
});

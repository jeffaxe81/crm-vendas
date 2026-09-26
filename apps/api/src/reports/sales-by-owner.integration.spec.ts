import { SalesByOwnerReportSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const URL = "/api/v1/reports/sales-by-owner";

describe("C4.5 sales by owner report API", () => {
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
        name: `Sales By Owner Organization ${suffix}`,
        slug: `sales-by-owner-${suffix}`,
      },
    });
    const password = "Strong-Sales-By-Product-Password-2026!";
    const user = await createUser(
      `sales-by-owner-admin-${suffix}@example.test`,
      password,
      `Sales By Owner Admin ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Sales By Owner ${suffix}`,
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
    suffix: string
  ) {
    const password = `Strong-${role}-Password-2026!`;
    const user = await createUser(
      `sales-by-owner-${role.toLowerCase()}-${suffix}@example.test`,
      password,
      `${role} ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: {
        organizationId: fixture.organization.id,
        userId: user.id,
        role,
      },
    });

    return {
      user,
      token: await login(user.email, password, fixture.organization.slug),
    };
  }

  /**
   * Dois funis, três situações de etapa, dois responsáveis e uma
   * oportunidade excluída. Valores com centavos para provar soma exata.
   */
  async function createSalesData(fixture: Fixture, sellerUserId: string) {
    const organizationId = fixture.organization.id;
    const author = fixture.user.id;

    return prisma.withTenant(organizationId, async tenant => {
      const pipelineA = await tenant.pipeline.create({
        data: { organizationId, name: "Funil A", normalizedName: "funil-a" },
      });
      const pipelineB = await tenant.pipeline.create({
        data: { organizationId, name: "Funil B", normalizedName: "funil-b" },
      });
      const stage = (
        pipelineId: string,
        name: string,
        position: number,
        kind: "OPEN" | "WON" | "LOST"
      ) =>
        tenant.pipelineStage.create({
          data: { organizationId, pipelineId, name, position, kind },
        });
      const openA = await stage(pipelineA.id, "Proposta", 1, "OPEN");
      const wonA = await stage(pipelineA.id, "Ganho", 2, "WON");
      const lostA = await stage(pipelineA.id, "Perdido", 3, "LOST");
      const openB = await stage(pipelineB.id, "Qualificação", 1, "OPEN");

      const opportunity = (input: {
        title: string;
        pipelineId: string;
        stageId: string;
        ownerUserId: string;
        value: string;
        expectedCloseAt: string | null;
        deleted?: boolean;
      }) =>
        tenant.opportunity.create({
          data: {
            organizationId,
            companyId: fixture.company.id,
            pipelineId: input.pipelineId,
            stageId: input.stageId,
            ownerUserId: input.ownerUserId,
            title: input.title,
            estimatedValue: input.value,
            expectedCloseAt: input.expectedCloseAt
              ? new Date(input.expectedCloseAt)
              : null,
            createdBy: author,
            updatedBy: author,
            ...(input.deleted
              ? { deletedAt: new Date(), deletedBy: author }
              : {}),
          },
        });

      await opportunity({
        title: "Ganha setembro",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: author,
        value: "2500.50",
        expectedCloseAt: "2026-09-10T00:00:00.000Z",
      });
      await opportunity({
        title: "Ganha outubro",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: sellerUserId,
        value: "1500.00",
        expectedCloseAt: "2026-10-05T12:00:00.000Z",
      });
      await opportunity({
        title: "Aberta setembro",
        pipelineId: pipelineA.id,
        stageId: openA.id,
        ownerUserId: author,
        value: "2800.00",
        expectedCloseAt: "2026-09-20T12:00:00.000Z",
      });
      await opportunity({
        title: "Perdida setembro",
        pipelineId: pipelineA.id,
        stageId: lostA.id,
        ownerUserId: sellerUserId,
        value: "1000.00",
        expectedCloseAt: "2026-09-15T12:00:00.000Z",
      });
      await opportunity({
        title: "Perdida no fim do período",
        pipelineId: pipelineA.id,
        stageId: lostA.id,
        ownerUserId: sellerUserId,
        value: "200.00",
        expectedCloseAt: "2026-09-30T23:59:59.999Z",
      });
      await opportunity({
        title: "Aberta sem data",
        pipelineId: pipelineB.id,
        stageId: openB.id,
        ownerUserId: author,
        value: "4300.00",
        expectedCloseAt: null,
      });
      await opportunity({
        title: "Excluída",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: author,
        value: "99999.00",
        expectedCloseAt: "2026-09-12T12:00:00.000Z",
        deleted: true,
      });

      return { pipelineA, pipelineB };
    });
  }

  async function getReport(token: string, query = "") {
    const response = await request(app.getHttpServer())
      .get(`${URL}${query}`)
      .set("Authorization", `Bearer ${token}`)
      .expect("Content-Type", /json/)
      .expect(200);
    return SalesByOwnerReportSchema.parse(response.body);
  }

  const bucket = (opportunities: number, value: string) => ({
    opportunities,
    value,
  });
  const empty = bucket(0, "0.00");

  it("returns an empty schema-valid report for an administrator", async () => {
    const fixture = await createFixture("empty");

    const report = await getReport(fixture.token);

    expect(report.items).toEqual([]);
    expect(report.totals).toEqual({
      open: empty,
      won: empty,
      lost: empty,
      total: empty,
      winRate: null,
    });
    expect(report.filters).toEqual({ from: null, to: null, pipelineId: null });
  });

  it("aggregates opportunities by owner and stage kind, ignoring deleted ones", async () => {
    const fixture = await createFixture("aggregate");
    const seller = await addMember(fixture, "SELLER", "aggregate");
    await createSalesData(fixture, seller.user.id);

    const report = await getReport(fixture.token);

    expect(report.items).toEqual([
      {
        ownerUserId: fixture.user.id,
        ownerName: "Sales By Owner Admin aggregate",
        ownerActive: true,
        open: bucket(2, "7100.00"),
        won: bucket(1, "2500.50"),
        lost: empty,
        total: bucket(3, "9600.50"),
        winRate: "100.0",
      },
      {
        ownerUserId: seller.user.id,
        ownerName: "SELLER aggregate",
        ownerActive: true,
        open: empty,
        won: bucket(1, "1500.00"),
        lost: bucket(2, "1200.00"),
        total: bucket(3, "2700.00"),
        winRate: "33.3",
      },
    ]);
    expect(report.totals).toEqual({
      open: bucket(2, "7100.00"),
      won: bucket(2, "4000.50"),
      lost: bucket(2, "1200.00"),
      total: bucket(6, "12300.50"),
      winRate: "50.0",
    });
  });

  it("applies inclusive period and pipeline filters", async () => {
    const fixture = await createFixture("filters");
    const seller = await addMember(fixture, "SELLER", "filters");
    const data = await createSalesData(fixture, seller.user.id);

    const september = await getReport(
      fixture.token,
      "?from=2026-09-01T00:00:00.000-03:00&to=2026-09-30T23:59:59.999Z"
    );
    expect(september.filters.from).toBe("2026-09-01T03:00:00.000Z");
    expect(
      september.items.map(item => [
        item.ownerUserId,
        item.won,
        item.lost,
        item.winRate,
      ])
    ).toEqual([
      [fixture.user.id, bucket(1, "2500.50"), empty, "100.0"],
      [seller.user.id, empty, bucket(2, "1200.00"), "0.0"],
    ]);
    expect(september.totals.total).toEqual(bucket(4, "6500.50"));

    const pipelineB = await getReport(
      fixture.token,
      `?pipelineId=${data.pipelineB.id}`
    );
    expect(pipelineB.items).toHaveLength(1);
    expect(pipelineB.items[0]).toMatchObject({
      ownerUserId: fixture.user.id,
      open: bucket(1, "4300.00"),
      winRate: null,
    });
    expect(pipelineB.totals.winRate).toBeNull();
  });

  it("keeps history of owners whose membership was deactivated", async () => {
    const fixture = await createFixture("inactive");
    const seller = await addMember(fixture, "SELLER", "inactive");
    await createSalesData(fixture, seller.user.id);
    await prisma.organizationMembership.update({
      where: {
        organizationId_userId: {
          organizationId: fixture.organization.id,
          userId: seller.user.id,
        },
      },
      data: { isActive: false },
    });

    const report = await getReport(fixture.token);
    const row = report.items.find(item => item.ownerUserId === seller.user.id);
    expect(row).toMatchObject({
      ownerActive: false,
      total: bucket(3, "2700.00"),
    });
  });

  it("isolates tenants and preserves exact large sums", async () => {
    const fixture = await createFixture("tenant-a");
    const seller = await addMember(fixture, "SELLER", "tenant-a");
    const data = await createSalesData(fixture, seller.user.id);
    const other = await createFixture("tenant-b");

    await prisma.withTenant(other.organization.id, async tenant => {
      const pipeline = await tenant.pipeline.create({
        data: {
          organizationId: other.organization.id,
          name: "Funil B2",
          normalizedName: "funil-b2",
        },
      });
      const won = await tenant.pipelineStage.create({
        data: {
          organizationId: other.organization.id,
          pipelineId: pipeline.id,
          name: "Ganho",
          position: 1,
          kind: "WON",
        },
      });
      for (const value of ["99999999999999999.15", "99999999999999999.15"]) {
        await tenant.opportunity.create({
          data: {
            organizationId: other.organization.id,
            companyId: other.company.id,
            pipelineId: pipeline.id,
            stageId: won.id,
            ownerUserId: other.user.id,
            title: "Grande",
            estimatedValue: value,
            createdBy: other.user.id,
            updatedBy: other.user.id,
          },
        });
      }
    });

    const mine = await getReport(fixture.token);
    expect(mine.items.map(item => item.ownerUserId).sort()).toEqual(
      [fixture.user.id, seller.user.id].sort()
    );
    expect(mine.totals.total).toEqual(bucket(6, "12300.50"));

    const theirs = await getReport(other.token);
    expect(theirs.items).toHaveLength(1);
    expect(theirs.items[0]?.won).toEqual(bucket(2, "199999999999999998.30"));

    const crossTenant = await getReport(
      other.token,
      `?pipelineId=${data.pipelineA.id}`
    );
    expect(crossTenant.items).toEqual([]);
    expect(crossTenant.totals.total).toEqual(empty);
  });

  it("enforces reports.read and validates the query", async () => {
    const fixture = await createFixture("rbac");
    const manager = await addMember(fixture, "MANAGER", "rbac");
    const seller = await addMember(fixture, "SELLER", "rbac");
    const viewer = await addMember(fixture, "VIEWER", "rbac");
    const other = await createFixture("rbac-other");
    await createSalesData(fixture, seller.user.id);

    const admin = await getReport(fixture.token);
    const managerReport = await getReport(manager.token);
    const { asOf: _adminAsOf, ...adminSnapshot } = admin;
    const { asOf: _managerAsOf, ...managerSnapshot } = managerReport;
    expect(managerSnapshot).toEqual(adminSnapshot);

    for (const token of [seller.token, viewer.token]) {
      const response = await request(app.getHttpServer())
        .get(URL)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
      expect(JSON.stringify(response.body)).not.toContain("SELLER rbac");
    }
    await request(app.getHttpServer()).get(URL).expect(401);

    for (const query of [
      `?organizationId=${other.organization.id}`,
      `?ownerUserId=${seller.user.id}`,
      "?from=2026-09-01",
      "?pipelineId=not-a-uuid",
      "?from=2026-09-30T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
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
        new Error("forced sales by owner database error")
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

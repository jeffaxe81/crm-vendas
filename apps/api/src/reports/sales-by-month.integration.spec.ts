import { SalesByMonthReportSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const URL = "/api/v1/reports/sales-by-month";

describe("C4.6 sales by month report API", () => {
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
        name: `Sales By Month Organization ${suffix}`,
        slug: `sales-by-month-${suffix}`,
      },
    });
    const password = "Strong-Sales-By-Month-Password-2026!";
    const user = await createUser(
      `sales-by-month-admin-${suffix}@example.test`,
      password,
      `Sales By Month Admin ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Sales By Month ${suffix}`,
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
      `sales-by-month-${role.toLowerCase()}-${suffix}@example.test`,
      password,
      `${role} ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: fixture.organization.id, userId: user.id, role },
    });

    return {
      user,
      token: await login(user.email, password, fixture.organization.slug),
    };
  }

  /**
   * Um funil, três situações de etapa, meses distintos (incluindo virada de
   * ano) e uma oportunidade excluída. Valores com centavos para soma exata.
   */
  async function createSalesData(fixture: Fixture) {
    const organizationId = fixture.organization.id;
    const author = fixture.user.id;

    return prisma.withTenant(organizationId, async tenant => {
      const pipeline = await tenant.pipeline.create({
        data: { organizationId, name: "Funil A", normalizedName: "funil-a" },
      });
      const stage = (
        name: string,
        position: number,
        kind: "OPEN" | "WON" | "LOST"
      ) =>
        tenant.pipelineStage.create({
          data: {
            organizationId,
            pipelineId: pipeline.id,
            name,
            position,
            kind,
          },
        });
      const open = await stage("Proposta", 1, "OPEN");
      const won = await stage("Ganho", 2, "WON");
      const lost = await stage("Perdido", 3, "LOST");

      const opportunity = (input: {
        title: string;
        stageId: string;
        value: string;
        expectedCloseAt: string;
        deleted?: boolean;
      }) =>
        tenant.opportunity.create({
          data: {
            organizationId,
            companyId: fixture.company.id,
            pipelineId: pipeline.id,
            stageId: input.stageId,
            ownerUserId: fixture.user.id,
            title: input.title,
            estimatedValue: input.value,
            expectedCloseAt: new Date(input.expectedCloseAt),
            createdBy: author,
            updatedBy: author,
            ...(input.deleted
              ? { deletedAt: new Date(), deletedBy: author }
              : {}),
          },
        });

      await opportunity({
        title: "Janeiro aberta",
        stageId: open.id,
        value: "1000.00",
        expectedCloseAt: "2026-01-10T12:00:00.000Z",
      });
      await opportunity({
        title: "Março ganha",
        stageId: won.id,
        value: "2500.50",
        expectedCloseAt: "2026-03-15T12:00:00.000Z",
      });
      await opportunity({
        title: "Março perdida",
        stageId: lost.id,
        value: "300.00",
        expectedCloseAt: "2026-03-20T12:00:00.000Z",
      });
      await opportunity({
        title: "Dezembro do ano anterior (fora do filtro)",
        stageId: won.id,
        value: "9999.99",
        expectedCloseAt: "2025-12-31T23:59:59.000Z",
      });
      await opportunity({
        title: "Excluída (fora do relatório)",
        stageId: won.id,
        value: "5000.00",
        expectedCloseAt: "2026-03-15T12:00:00.000Z",
        deleted: true,
      });

      return { pipeline, open, won, lost };
    });
  }

  it("requires reports.read and rejects a missing or out-of-range year", async () => {
    const fixture = await createFixture("auth");
    const viewer = await addMember(fixture, "VIEWER", "auth");

    // VIEWER não tem reports.read neste sistema — só ADMIN/MANAGER.
    await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${viewer.token}`)
      .query({ year: 2026 })
      .expect(403);

    await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${fixture.token}`)
      .query({ year: 2026 })
      .expect(200);

    await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${fixture.token}`)
      .query({ year: 1999 })
      .expect(400);
  });

  it("aggregates opportunities by month, keeps 12 rows and ignores other years", async () => {
    const fixture = await createFixture("aggregate");
    await createSalesData(fixture);

    const response = await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${fixture.token}`)
      .query({ year: 2026 })
      .expect(200);

    const report = SalesByMonthReportSchema.parse(response.body);
    expect(report.items).toHaveLength(12);
    expect(report.filters).toEqual({ year: 2026, pipelineId: null });

    const january = report.items.find(item => item.month === 1)!;
    expect(january.open).toEqual({ opportunities: 1, value: "1000.00" });

    const march = report.items.find(item => item.month === 3)!;
    expect(march.won).toEqual({ opportunities: 1, value: "2500.50" });
    expect(march.lost).toEqual({ opportunities: 1, value: "300.00" });
    expect(march.winRate).toBe("50.0");

    const february = report.items.find(item => item.month === 2)!;
    expect(february.total).toEqual({ opportunities: 0, value: "0.00" });

    // A oportunidade de dezembro/2025 e a excluída não entram na soma.
    expect(report.totals.total).toEqual({
      opportunities: 3,
      value: "3800.50",
    });
  });

  it("isolates organizations and filters by pipeline", async () => {
    const fixtureA = await createFixture("tenant-a");
    const fixtureB = await createFixture("tenant-b");
    await createSalesData(fixtureA);

    const otherPipeline = await prisma.withTenant(
      fixtureA.organization.id,
      tenant =>
        tenant.pipeline.create({
          data: {
            organizationId: fixtureA.organization.id,
            name: "Funil B",
            normalizedName: "funil-b",
          },
        })
    );

    const filtered = await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${fixtureA.token}`)
      .query({ year: 2026, pipelineId: otherPipeline.id })
      .expect(200);
    const filteredReport = SalesByMonthReportSchema.parse(filtered.body);
    expect(filteredReport.totals.total).toEqual({
      opportunities: 0,
      value: "0.00",
    });

    const isolated = await request(app.getHttpServer())
      .get(URL)
      .set("Authorization", `Bearer ${fixtureB.token}`)
      .query({ year: 2026 })
      .expect(200);
    const isolatedReport = SalesByMonthReportSchema.parse(isolated.body);
    expect(isolatedReport.totals.total).toEqual({
      opportunities: 0,
      value: "0.00",
    });
  });
});

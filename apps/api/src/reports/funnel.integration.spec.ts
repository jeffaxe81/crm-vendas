import { FunnelReportSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const URL = "/api/v1/reports/funnel";

describe("C4.4.2 funnel and conversion report API", () => {
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
        name: `Funnel Organization ${suffix}`,
        slug: `funnel-${suffix}`,
      },
    });
    const password = "Strong-Sales-By-Product-Password-2026!";
    const user = await createUser(
      `funnel-admin-${suffix}@example.test`,
      password,
      `Funnel Admin ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Funnel ${suffix}`,
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
      `funnel-${role.toLowerCase()}-${suffix}@example.test`,
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
   * Funil A: Prospecção (OPEN), Proposta (OPEN), Ganho (WON), Perdido (LOST)
   * e uma etapa desativada; Funil B separado; uma oportunidade excluída.
   */
  async function createFunnelData(fixture: Fixture, sellerUserId: string) {
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
      // Criadas fora de ordem para provar a ordenação por position.
      const won = await stage(pipelineA.id, "Ganho", 3, "WON");
      const prospect = await stage(pipelineA.id, "Prospecção", 1, "OPEN");
      const proposal = await stage(pipelineA.id, "Proposta", 2, "OPEN");
      const lost = await stage(pipelineA.id, "Perdido", 4, "LOST");
      const legacy = await stage(pipelineA.id, "Antiga", 5, "OPEN");
      const qualification = await stage(
        pipelineB.id,
        "Qualificação",
        1,
        "OPEN"
      );

      const opportunity = (input: {
        title: string;
        pipelineId: string;
        stageId: string;
        ownerUserId: string;
        value: string;
        createdAt: string;
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
            // Previsão de fechamento propositalmente fora do período para
            // provar que o filtro usa a data de criação.
            expectedCloseAt: new Date("2027-01-15T12:00:00.000Z"),
            createdAt: new Date(input.createdAt),
            createdBy: author,
            updatedBy: author,
            ...(input.deleted
              ? { deletedAt: new Date(), deletedBy: author }
              : {}),
          },
        });
      const a = pipelineA.id;

      await opportunity({
        title: "Prospecção admin",
        pipelineId: a,
        stageId: prospect.id,
        ownerUserId: author,
        value: "1000.00",
        createdAt: "2026-09-01T00:00:00.000Z",
      });
      await opportunity({
        title: "Prospecção vendedor",
        pipelineId: a,
        stageId: prospect.id,
        ownerUserId: sellerUserId,
        value: "500.25",
        createdAt: "2026-09-10T10:00:00.000Z",
      });
      const proposalOpportunity = await opportunity({
        title: "Proposta admin",
        pipelineId: a,
        stageId: proposal.id,
        ownerUserId: author,
        value: "2000.00",
        createdAt: "2026-09-15T12:00:00.000Z",
      });
      await opportunity({
        title: "Ganha agosto",
        pipelineId: a,
        stageId: won.id,
        ownerUserId: author,
        value: "3000.00",
        createdAt: "2026-08-20T12:00:00.000Z",
      });
      await opportunity({
        title: "Ganha vendedor",
        pipelineId: a,
        stageId: won.id,
        ownerUserId: sellerUserId,
        value: "1500.50",
        createdAt: "2026-09-05T12:00:00.000Z",
      });
      await opportunity({
        title: "Perdida vendedor",
        pipelineId: a,
        stageId: lost.id,
        ownerUserId: sellerUserId,
        value: "800.00",
        createdAt: "2026-09-20T12:00:00.000Z",
      });
      await opportunity({
        title: "Etapa desativada",
        pipelineId: a,
        stageId: legacy.id,
        ownerUserId: author,
        value: "100.00",
        createdAt: "2026-09-02T12:00:00.000Z",
      });
      await opportunity({
        title: "Excluída",
        pipelineId: a,
        stageId: won.id,
        ownerUserId: author,
        value: "99999.00",
        createdAt: "2026-09-03T12:00:00.000Z",
        deleted: true,
      });
      await opportunity({
        title: "Outro funil",
        pipelineId: pipelineB.id,
        stageId: qualification.id,
        ownerUserId: author,
        value: "7000.00",
        createdAt: "2026-09-04T12:00:00.000Z",
      });

      await tenant.pipelineStage.update({
        where: { id: legacy.id },
        data: { isActive: false },
      });

      return {
        pipelineA,
        pipelineB,
        stages: { prospect, proposal, won, lost, legacy },
        proposalOpportunity,
      };
    });
  }

  async function getReport(token: string, query: string) {
    const response = await request(app.getHttpServer())
      .get(`${URL}?${query}`)
      .set("Authorization", `Bearer ${token}`)
      .expect("Content-Type", /json/)
      .expect(200);
    return FunnelReportSchema.parse(response.body);
  }

  const summarize = (report: { stages: Array<Record<string, unknown>> }) =>
    report.stages.map(stage => [
      stage.name,
      stage.kind,
      stage.opportunities,
      stage.value,
    ]);

  it("aggregates active stages in position order with totals and indicators", async () => {
    const fixture = await createFixture("aggregate");
    const seller = await addMember(fixture, "SELLER", "aggregate");
    const data = await createFunnelData(fixture, seller.user.id);

    const report = await getReport(
      fixture.token,
      `pipelineId=${data.pipelineA.id}`
    );

    expect(report.pipeline).toEqual({
      id: data.pipelineA.id,
      name: "Funil A",
      isActive: true,
    });
    expect(report.filters).toEqual({
      pipelineId: data.pipelineA.id,
      from: null,
      to: null,
      ownerUserId: null,
    });
    expect(report.stages.map(stage => stage.stageId)).toEqual([
      data.stages.prospect.id,
      data.stages.proposal.id,
      data.stages.won.id,
      data.stages.lost.id,
    ]);
    expect(summarize(report)).toEqual([
      ["Prospecção", "OPEN", 2, "1500.25"],
      ["Proposta", "OPEN", 1, "2000.00"],
      ["Ganho", "WON", 2, "4500.50"],
      ["Perdido", "LOST", 1, "800.00"],
    ]);
    expect(report.inactiveStages).toEqual({
      opportunities: 1,
      value: "100.00",
    });
    expect(report.totals).toEqual({ opportunities: 7, value: "8900.75" });
    expect(report.indicators).toEqual({
      openOpportunities: 4,
      wonOpportunities: 2,
      lostOpportunities: 1,
      winRate: "66.67",
      openValue: "3600.25",
      wonValue: "4500.50",
      lostValue: "800.00",
      averageWonTicket: "2250.25",
    });

    const other = await getReport(
      fixture.token,
      `pipelineId=${data.pipelineB.id}`
    );
    expect(summarize(other)).toEqual([["Qualificação", "OPEN", 1, "7000.00"]]);
    expect(other.indicators.winRate).toBeNull();
    expect(other.indicators.averageWonTicket).toBeNull();
  });

  it("applies creation period and owner filters", async () => {
    const fixture = await createFixture("filters");
    const seller = await addMember(fixture, "SELLER", "filters");
    const data = await createFunnelData(fixture, seller.user.id);
    const base = `pipelineId=${data.pipelineA.id}`;

    const september = await getReport(
      fixture.token,
      `${base}&from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z`
    );
    expect(september.filters).toMatchObject({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T23:59:59.999Z",
    });
    expect(summarize(september)).toEqual([
      ["Prospecção", "OPEN", 2, "1500.25"],
      ["Proposta", "OPEN", 1, "2000.00"],
      ["Ganho", "WON", 1, "1500.50"],
      ["Perdido", "LOST", 1, "800.00"],
    ]);
    expect(september.totals).toEqual({ opportunities: 6, value: "5900.75" });
    expect(september.indicators).toMatchObject({
      winRate: "50.00",
      wonValue: "1500.50",
      averageWonTicket: "1500.50",
    });

    // Limite inclusivo em "to", com fuso explícito (= 15/09 12:00 UTC).
    const boundary = await getReport(
      fixture.token,
      `${base}&from=2026-09-15T12:00:00.000Z&to=${encodeURIComponent(
        "2026-09-15T09:00:00.000-03:00"
      )}`
    );
    expect(boundary.totals).toEqual({ opportunities: 1, value: "2000.00" });
    expect(boundary.stages[1]?.stageId).toBe(data.proposalOpportunity.stageId);

    const bySeller = await getReport(
      fixture.token,
      `${base}&ownerUserId=${seller.user.id}`
    );
    expect(summarize(bySeller)).toEqual([
      ["Prospecção", "OPEN", 1, "500.25"],
      ["Proposta", "OPEN", 0, "0.00"],
      ["Ganho", "WON", 1, "1500.50"],
      ["Perdido", "LOST", 1, "800.00"],
    ]);
    expect(bySeller.indicators.winRate).toBe("50.00");
    expect(bySeller.totals).toEqual({ opportunities: 3, value: "2800.75" });

    const combined = await getReport(
      fixture.token,
      `${base}&ownerUserId=${fixture.user.id}&to=2026-09-02T23:59:59.999Z`
    );
    expect(combined.totals).toEqual({ opportunities: 3, value: "4100.00" });
    expect(combined.inactiveStages).toEqual({
      opportunities: 1,
      value: "100.00",
    });
    expect(combined.indicators).toMatchObject({
      openOpportunities: 2,
      openValue: "1100.00",
      winRate: "100.00",
      averageWonTicket: "3000.00",
    });
  });

  it("returns null ratios on division by zero and rounds rates half up", async () => {
    const fixture = await createFixture("ratios");
    const seller = await addMember(fixture, "SELLER", "ratios");
    const data = await createFunnelData(fixture, seller.user.id);
    const base = `pipelineId=${data.pipelineA.id}`;

    // Nenhuma oportunidade no período: etapas continuam listadas zeradas.
    const empty = await getReport(
      fixture.token,
      `${base}&from=2026-10-01T00:00:00.000Z`
    );
    expect(summarize(empty)).toEqual([
      ["Prospecção", "OPEN", 0, "0.00"],
      ["Proposta", "OPEN", 0, "0.00"],
      ["Ganho", "WON", 0, "0.00"],
      ["Perdido", "LOST", 0, "0.00"],
    ]);
    expect(empty.totals).toEqual({ opportunities: 0, value: "0.00" });
    expect(empty.indicators).toEqual({
      openOpportunities: 0,
      wonOpportunities: 0,
      lostOpportunities: 0,
      winRate: null,
      openValue: "0.00",
      wonValue: "0.00",
      lostValue: "0.00",
      averageWonTicket: null,
    });

    // Só perdidas: taxa 0,00 e ticket médio nulo.
    const onlyLost = await getReport(
      fixture.token,
      `${base}&ownerUserId=${seller.user.id}&from=2026-09-12T00:00:00.000Z`
    );
    expect(onlyLost.indicators).toMatchObject({
      winRate: "0.00",
      lostValue: "800.00",
      averageWonTicket: null,
    });

    // 1 ganha em 3 encerradas = 33,333...% e ticket 1000,01 / 3 = 333,336...
    const roundingPipeline = await prisma.withTenant(
      fixture.organization.id,
      async tenant => {
        const organizationId = fixture.organization.id;
        const author = fixture.user.id;
        const pipeline = await tenant.pipeline.create({
          data: { organizationId, name: "Funil C", normalizedName: "funil-c" },
        });
        const won = await tenant.pipelineStage.create({
          data: {
            organizationId,
            pipelineId: pipeline.id,
            name: "Ganho",
            position: 1,
            kind: "WON",
          },
        });
        const lost = await tenant.pipelineStage.create({
          data: {
            organizationId,
            pipelineId: pipeline.id,
            name: "Perdido",
            position: 2,
            kind: "LOST",
          },
        });
        for (const [stageId, value] of [
          [won.id, "1000.01"],
          [won.id, "0.00"],
          [won.id, "0.00"],
          [lost.id, "1.00"],
          [lost.id, "1.00"],
          [lost.id, "1.00"],
          [lost.id, "1.00"],
          [lost.id, "1.00"],
          [lost.id, "1.00"],
        ] as const) {
          await tenant.opportunity.create({
            data: {
              organizationId,
              companyId: fixture.company.id,
              pipelineId: pipeline.id,
              stageId,
              ownerUserId: author,
              title: "Arredondamento",
              estimatedValue: value,
              createdBy: author,
              updatedBy: author,
            },
          });
        }
        return pipeline;
      }
    );
    const rounding = await getReport(
      fixture.token,
      `pipelineId=${roundingPipeline.id}`
    );
    expect(rounding.indicators).toMatchObject({
      wonOpportunities: 3,
      lostOpportunities: 6,
      winRate: "33.33",
      averageWonTicket: "333.34",
    });
  });

  it("isolates tenants, returns 404 for unknown pipelines and keeps exact sums", async () => {
    const fixture = await createFixture("tenant-a");
    const seller = await addMember(fixture, "SELLER", "tenant-a");
    const data = await createFunnelData(fixture, seller.user.id);
    const other = await createFixture("tenant-b");

    const otherPipeline = await prisma.withTenant(
      other.organization.id,
      async tenant => {
        const organizationId = other.organization.id;
        const author = other.user.id;
        const pipeline = await tenant.pipeline.create({
          data: {
            organizationId,
            name: "Funil B2",
            normalizedName: "funil-b2",
            isActive: false,
          },
        });
        const won = await tenant.pipelineStage.create({
          data: {
            organizationId,
            pipelineId: pipeline.id,
            name: "Ganho",
            position: 1,
            kind: "WON",
          },
        });
        for (const value of ["90000000000000000.10", "0.21"]) {
          await tenant.opportunity.create({
            data: {
              organizationId,
              companyId: other.company.id,
              pipelineId: pipeline.id,
              stageId: won.id,
              ownerUserId: author,
              title: "Grande",
              estimatedValue: value,
              createdBy: author,
              updatedBy: author,
            },
          });
        }
        return pipeline;
      }
    );

    // Funil inativo do próprio tenant continua consultável.
    const theirs = await getReport(
      other.token,
      `pipelineId=${otherPipeline.id}`
    );
    expect(theirs.pipeline.isActive).toBe(false);
    expect(theirs.totals.value).toBe("90000000000000000.31");
    expect(theirs.indicators).toMatchObject({
      winRate: "100.00",
      wonValue: "90000000000000000.31",
      averageWonTicket: "45000000000000000.16",
    });

    for (const [token, pipelineId] of [
      [other.token, data.pipelineA.id],
      [fixture.token, otherPipeline.id],
      [fixture.token, "99999999-9999-4999-8999-999999999999"],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`${URL}?pipelineId=${pipelineId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
      expect(response.body.code).toBe("PIPELINE_NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toMatch(/Funil (A|B2)/);
    }

    const mine = await getReport(
      fixture.token,
      `pipelineId=${data.pipelineA.id}&ownerUserId=${other.user.id}`
    );
    expect(mine.totals).toEqual({ opportunities: 0, value: "0.00" });
  });

  it("enforces reports.read and validates the query", async () => {
    const fixture = await createFixture("rbac");
    const manager = await addMember(fixture, "MANAGER", "rbac");
    const seller = await addMember(fixture, "SELLER", "rbac");
    const viewer = await addMember(fixture, "VIEWER", "rbac");
    const other = await createFixture("rbac-other");
    const data = await createFunnelData(fixture, seller.user.id);
    const base = `pipelineId=${data.pipelineA.id}`;

    const admin = await getReport(fixture.token, base);
    const managerReport = await getReport(manager.token, base);
    const { asOf: _adminAsOf, ...adminSnapshot } = admin;
    const { asOf: _managerAsOf, ...managerSnapshot } = managerReport;
    expect(managerSnapshot).toEqual(adminSnapshot);

    for (const token of [seller.token, viewer.token]) {
      const response = await request(app.getHttpServer())
        .get(`${URL}?${base}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
      expect(JSON.stringify(response.body)).not.toContain("Prospecção");
    }
    await request(app.getHttpServer()).get(`${URL}?${base}`).expect(401);

    for (const query of [
      "",
      "pipelineId=not-a-uuid",
      `${base}&organizationId=${other.organization.id}`,
      `${base}&from=2026-09-01`,
      `${base}&ownerUserId=123`,
      `${base}&from=2026-09-30T00:00:00.000Z&to=2026-09-01T00:00:00.000Z`,
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${URL}?${query}`)
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
        new Error("forced funnel database error")
      )) as typeof prisma.withTenant;

    try {
      await request(app.getHttpServer())
        .get(`${URL}?pipelineId=99999999-9999-4999-8999-999999999999`)
        .set("Authorization", `Bearer ${fixture.token}`)
        .expect(500);
    } finally {
      prisma.withTenant = originalWithTenant;
    }
  });
});

import { SalesByProductReportSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const URL = "/api/v1/reports/sales-by-product";

describe("C4.4 sales by product report API", () => {
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
        name: `Sales By Product Organization ${suffix}`,
        slug: `sales-by-product-${suffix}`,
      },
    });
    const password = "Strong-Sales-By-Product-Password-2026!";
    const user = await createUser(
      `sales-by-product-admin-${suffix}@example.test`,
      password,
      `Sales By Product Admin ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Sales By Product ${suffix}`,
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
      `sales-by-product-${role.toLowerCase()}-${suffix}@example.test`,
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
   * Monta um cenário com dois funis, três situações de etapa, dois
   * responsáveis, um produto excluído e uma oportunidade excluída.
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
      const stage =
        (pipelineId: string, name: string, position: number) =>
        (kind: "OPEN" | "WON" | "LOST") =>
          tenant.pipelineStage.create({
            data: { organizationId, pipelineId, name, position, kind },
          });
      const openA = await stage(pipelineA.id, "Proposta", 1)("OPEN");
      const wonA = await stage(pipelineA.id, "Ganho", 2)("WON");
      const lostA = await stage(pipelineA.id, "Perdido", 3)("LOST");
      const openB = await stage(pipelineB.id, "Qualificação", 1)("OPEN");

      const product = (code: string, name: string) =>
        tenant.product.create({
          data: {
            organizationId,
            code,
            name,
            unitPrice: "100.00",
            createdBy: author,
            updatedBy: author,
          },
        });
      const license = await product("LIC", "Licença");
      const implementation = await product("IMPL", "Implantação");
      // Nome em ordem alfabética anterior para provar o desempate por
      // valor em aberto; excluído depois de usado.
      const support = await product("SUP", "Assistência");
      await product("UNUSED", "Sem vendas");

      const opportunity = async (input: {
        title: string;
        pipelineId: string;
        stageId: string;
        ownerUserId: string;
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
            estimatedValue: "0.00",
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
      const item = (
        opportunityId: string,
        productId: string,
        quantity: string,
        lineTotal: string
      ) =>
        tenant.opportunityItem.create({
          data: {
            organizationId,
            opportunityId,
            productId,
            description: "snapshot",
            quantity,
            unitPrice: lineTotal,
            lineTotal,
            createdBy: author,
            updatedBy: author,
          },
        });

      const o1 = await opportunity({
        title: "Ganha setembro",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: author,
        expectedCloseAt: "2026-09-10T00:00:00.000Z",
      });
      await item(o1.id, license.id, "2", "2000.00");
      await item(o1.id, implementation.id, "1", "500.50");

      const o2 = await opportunity({
        title: "Ganha outubro",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: sellerUserId,
        expectedCloseAt: "2026-10-05T12:00:00.000Z",
      });
      await item(o2.id, license.id, "1.5", "1500.00");

      const o3 = await opportunity({
        title: "Aberta setembro",
        pipelineId: pipelineA.id,
        stageId: openA.id,
        ownerUserId: author,
        expectedCloseAt: "2026-09-20T12:00:00.000Z",
      });
      await item(o3.id, license.id, "3", "2700.00");
      await item(o3.id, license.id, "1", "100.00");

      const o4 = await opportunity({
        title: "Perdida setembro",
        pipelineId: pipelineA.id,
        stageId: lostA.id,
        ownerUserId: sellerUserId,
        expectedCloseAt: "2026-09-15T12:00:00.000Z",
      });
      await item(o4.id, implementation.id, "2", "1000.00");

      const o5 = await opportunity({
        title: "Aberta sem data",
        pipelineId: pipelineB.id,
        stageId: openB.id,
        ownerUserId: author,
        expectedCloseAt: null,
      });
      await item(o5.id, support.id, "1", "300.00");
      await item(o5.id, implementation.id, "4", "4000.00");

      const o6 = await opportunity({
        title: "Excluída",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: author,
        expectedCloseAt: "2026-09-12T12:00:00.000Z",
        deleted: true,
      });
      await item(o6.id, license.id, "10", "99999.00");

      await tenant.product.update({
        where: { id: support.id },
        data: { isActive: false, deletedAt: new Date(), deletedBy: author },
      });

      return { pipelineA, pipelineB, license, implementation, support };
    });
  }

  async function getReport(token: string, query = "") {
    const response = await request(app.getHttpServer())
      .get(`${URL}${query}`)
      .set("Authorization", `Bearer ${token}`)
      .expect("Content-Type", /json/)
      .expect(200);
    return SalesByProductReportSchema.parse(response.body);
  }

  const bucket = (quantity: string, opportunities: number, value: string) => ({
    quantity,
    opportunities,
    value,
  });
  const empty = bucket("0.000", 0, "0.00");

  it("returns an empty schema-valid report for an administrator", async () => {
    const fixture = await createFixture("empty");

    const report = await getReport(fixture.token);

    expect(report.items).toEqual([]);
    expect(report.totals).toEqual({
      open: empty,
      won: empty,
      lost: empty,
      total: empty,
    });
    expect(report.filters).toEqual({
      from: null,
      to: null,
      pipelineId: null,
      ownerUserId: null,
    });
  });

  it("aggregates items by product and stage kind, ignoring deleted opportunities", async () => {
    const fixture = await createFixture("aggregate");
    const seller = await addMember(fixture, "SELLER", "aggregate");
    const data = await createSalesData(fixture, seller.user.id);

    const report = await getReport(fixture.token);

    expect(report.items.map(item => item.productCode)).toEqual([
      "LIC",
      "IMPL",
      "SUP",
    ]);
    expect(report.items[0]).toEqual({
      productId: data.license.id,
      productCode: "LIC",
      productName: "Licença",
      productActive: true,
      productDeleted: false,
      open: bucket("4.000", 1, "2800.00"),
      won: bucket("3.500", 2, "3500.00"),
      lost: empty,
      total: bucket("7.500", 3, "6300.00"),
    });
    expect(report.items[1]).toMatchObject({
      productId: data.implementation.id,
      open: bucket("4.000", 1, "4000.00"),
      won: bucket("1.000", 1, "500.50"),
      lost: bucket("2.000", 1, "1000.00"),
      total: bucket("7.000", 3, "5500.50"),
    });
    expect(report.items[2]).toMatchObject({
      productId: data.support.id,
      productActive: false,
      productDeleted: true,
      open: bucket("1.000", 1, "300.00"),
      total: bucket("1.000", 1, "300.00"),
    });
    expect(report.totals).toEqual({
      open: bucket("9.000", 2, "7100.00"),
      won: bucket("4.500", 2, "4000.50"),
      lost: bucket("2.000", 1, "1000.00"),
      total: bucket("15.500", 5, "12100.50"),
    });
  });

  it("applies period, pipeline and owner filters", async () => {
    const fixture = await createFixture("filters");
    const seller = await addMember(fixture, "SELLER", "filters");
    const data = await createSalesData(fixture, seller.user.id);

    const september = await getReport(
      fixture.token,
      "?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z"
    );
    expect(september.filters).toMatchObject({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T23:59:59.999Z",
    });
    expect(september.items.map(item => item.productCode)).toEqual([
      "LIC",
      "IMPL",
    ]);
    expect(september.items[0]).toMatchObject({
      open: bucket("4.000", 1, "2800.00"),
      won: bucket("2.000", 1, "2000.00"),
    });
    expect(september.items[1]).toMatchObject({
      won: bucket("1.000", 1, "500.50"),
      lost: bucket("2.000", 1, "1000.00"),
      open: empty,
    });
    expect(september.totals.total).toEqual(bucket("9.000", 3, "6300.50"));

    // Limite inclusivo em "to" e com fuso explícito.
    const boundary = await getReport(
      fixture.token,
      `?to=${encodeURIComponent("2026-09-09T21:00:00.000-03:00")}`
    );
    expect(boundary.totals.total).toEqual(bucket("3.000", 1, "2500.50"));

    const pipelineB = await getReport(
      fixture.token,
      `?pipelineId=${data.pipelineB.id}`
    );
    // Mesmo valor ganho (zero): o desempate é pelo valor em aberto desc.
    expect(pipelineB.items.map(item => item.productCode)).toEqual([
      "IMPL",
      "SUP",
    ]);
    expect(pipelineB.totals.open).toEqual(bucket("5.000", 1, "4300.00"));

    const bySeller = await getReport(
      fixture.token,
      `?ownerUserId=${seller.user.id}`
    );
    expect(bySeller.items.map(item => item.productCode)).toEqual([
      "LIC",
      "IMPL",
    ]);
    expect(bySeller.items[0]?.won).toEqual(bucket("1.500", 1, "1500.00"));
    expect(bySeller.items[1]?.lost).toEqual(bucket("2.000", 1, "1000.00"));
    expect(bySeller.totals.total).toEqual(bucket("3.500", 2, "2500.00"));

    const combined = await getReport(
      fixture.token,
      `?pipelineId=${data.pipelineA.id}&ownerUserId=${fixture.user.id}&from=2026-09-15T00:00:00.000Z`
    );
    expect(combined.items.map(item => item.productCode)).toEqual(["LIC"]);
    expect(combined.totals.total).toEqual(bucket("4.000", 1, "2800.00"));
  });

  it("isolates tenants and preserves exact large sums", async () => {
    const fixture = await createFixture("tenant-a");
    const seller = await addMember(fixture, "SELLER", "tenant-a");
    const data = await createSalesData(fixture, seller.user.id);
    const other = await createFixture("tenant-b");

    const otherProduct = await prisma.withTenant(
      other.organization.id,
      async tenant => {
        const organizationId = other.organization.id;
        const author = other.user.id;
        const pipeline = await tenant.pipeline.create({
          data: { organizationId, name: "Funil", normalizedName: "funil" },
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
        const product = await tenant.product.create({
          data: {
            organizationId,
            code: "LIC",
            name: "Licença outro tenant",
            unitPrice: "1.00",
            createdBy: author,
            updatedBy: author,
          },
        });
        for (const [title, value] of [
          ["Grande 1", "90000000000000000.10"],
          ["Grande 2", "0.20"],
        ] as const) {
          const opportunity = await tenant.opportunity.create({
            data: {
              organizationId,
              companyId: other.company.id,
              pipelineId: pipeline.id,
              stageId: won.id,
              ownerUserId: author,
              title,
              estimatedValue: value,
              createdBy: author,
              updatedBy: author,
            },
          });
          await tenant.opportunityItem.create({
            data: {
              organizationId,
              opportunityId: opportunity.id,
              productId: product.id,
              description: "snapshot",
              quantity: "1",
              unitPrice: value,
              lineTotal: value,
              createdBy: author,
              updatedBy: author,
            },
          });
        }
        return product;
      }
    );

    const mine = await getReport(fixture.token);
    expect(mine.items.some(item => item.productId === otherProduct.id)).toBe(
      false
    );
    expect(mine.totals.total).toEqual(bucket("15.500", 5, "12100.50"));

    const theirs = await getReport(other.token);
    expect(theirs.items).toHaveLength(1);
    expect(theirs.items[0]).toMatchObject({
      productId: otherProduct.id,
      won: bucket("2.000", 2, "90000000000000000.30"),
    });
    expect(theirs.totals.total.value).toBe("90000000000000000.30");

    // Filtrar pelo funil de outro tenant não revela nada.
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
      expect(JSON.stringify(response.body)).not.toContain("Licença");
    }
    await request(app.getHttpServer()).get(URL).expect(401);

    for (const query of [
      `?organizationId=${other.organization.id}`,
      "?from=2026-09-01",
      "?pipelineId=not-a-uuid",
      "?ownerUserId=123",
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
        new Error("forced sales by product database error")
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

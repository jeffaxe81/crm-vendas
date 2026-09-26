import { SalesByProductOwnersSchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { SALES_BY_PRODUCT_CSV_HEADER } from "./sales-by-product-csv";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const EXPORT_URL = "/api/v1/reports/sales-by-product/export";
const OWNERS_URL = "/api/v1/reports/sales-by-product/owners";
const BOM = "﻿";

describe("C4.4.1 sales by product CSV export and owners API", () => {
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
        name: `Sales Export Organization ${suffix}`,
        slug: `sales-export-${suffix}`,
      },
    });
    const password = "Strong-Sales-Export-Password-2026!";
    const user = await createUser(
      `sales-export-admin-${suffix}@example.test`,
      password,
      `Admin ${suffix}`
    );

    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Sales Export ${suffix}`,
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
      `sales-export-${role.toLowerCase()}-${suffix}@example.test`,
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
   * Dois funis, dois responsáveis, um produto com nome malicioso (fórmula)
   * e uma oportunidade excluída que não pode aparecer na exportação.
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
      const wonA = await tenant.pipelineStage.create({
        data: {
          organizationId,
          pipelineId: pipelineA.id,
          name: "Ganho",
          position: 1,
          kind: "WON",
        },
      });
      const openB = await tenant.pipelineStage.create({
        data: {
          organizationId,
          pipelineId: pipelineB.id,
          name: "Proposta",
          position: 1,
          kind: "OPEN",
        },
      });

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
      const license = await product("LIC", "Licença; PABX");
      const malicious = await product("+CMD", '=HYPERLINK("http://mal")');

      const opportunity = (input: {
        title: string;
        pipelineId: string;
        stageId: string;
        ownerUserId: string;
        expectedCloseAt: string;
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
            expectedCloseAt: new Date(input.expectedCloseAt),
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
        title: "Ganha admin",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: author,
        expectedCloseAt: "2026-09-10T12:00:00.000Z",
      });
      await item(o1.id, license.id, "2.5", "2500.50");

      const o2 = await opportunity({
        title: "Aberta vendedor",
        pipelineId: pipelineB.id,
        stageId: openB.id,
        ownerUserId: sellerUserId,
        expectedCloseAt: "2026-10-10T12:00:00.000Z",
      });
      await item(o2.id, malicious.id, "1", "100.00");

      const deleted = await opportunity({
        title: "Excluída",
        pipelineId: pipelineA.id,
        stageId: wonA.id,
        ownerUserId: author,
        expectedCloseAt: "2026-09-12T12:00:00.000Z",
        deleted: true,
      });
      await item(deleted.id, license.id, "10", "99999.00");

      return { pipelineA, pipelineB };
    });
  }

  async function exportCsv(token: string, query = "") {
    const response = await request(app.getHttpServer())
      .get(`${EXPORT_URL}${query}`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          callback(null, Buffer.concat(chunks).toString("utf8"))
        );
      })
      .expect(200);
    const body = response.body as string;
    return { response, body, lines: body.slice(1, -2).split("\r\n") };
  }

  it("exports the aggregated report as an Excel pt-BR CSV", async () => {
    const fixture = await createFixture("content");
    const seller = await addMember(fixture, "SELLER", "content");
    await createSalesData(fixture, seller.user.id);

    const { response, body, lines } = await exportCsv(fixture.token);

    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="vendas-por-produto-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(body.startsWith(BOM)).toBe(true);
    expect(body.endsWith("\r\n")).toBe(true);

    expect(lines).toEqual([
      SALES_BY_PRODUCT_CSV_HEADER.join(";"),
      'LIC;"Licença; PABX";Ativo;0,000;0;0,00;2,500;1;2500,50;0,000;0;0,00;2,500;1;2500,50',
      '\'+CMD;"\'=HYPERLINK(""http://mal"")";Ativo;1,000;1;100,00;0,000;0;0,00;0,000;0;0,00;1,000;1;100,00',
      ";Total geral;;1,000;1;100,00;2,500;1;2500,50;0,000;0;0,00;3,500;2;2600,50",
    ]);
    expect(body).not.toContain("99999");
  });

  it("applies the same filters as the JSON report", async () => {
    const fixture = await createFixture("filters");
    const seller = await addMember(fixture, "SELLER", "filters");
    const data = await createSalesData(fixture, seller.user.id);

    const september = await exportCsv(
      fixture.token,
      "?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z"
    );
    expect(september.lines).toHaveLength(3);
    expect(september.lines[1]).toMatch(/^LIC;/);

    const byPipeline = await exportCsv(
      fixture.token,
      `?pipelineId=${data.pipelineB.id}`
    );
    expect(byPipeline.lines).toHaveLength(3);
    expect(byPipeline.lines[1]).toMatch(/^'\+CMD;/);

    const byOwner = await exportCsv(
      fixture.token,
      `?ownerUserId=${seller.user.id}&pipelineId=${data.pipelineA.id}`
    );
    expect(byOwner.lines).toEqual([
      SALES_BY_PRODUCT_CSV_HEADER.join(";"),
      ";Total geral;;0,000;0;0,00;0,000;0;0,00;0,000;0;0,00;0,000;0;0,00",
    ]);

    for (const query of [
      "?from=2026-09-01",
      "?pipelineId=not-a-uuid",
      "?format=xlsx",
      "?from=2026-09-30T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${EXPORT_URL}${query}`)
        .set("Authorization", `Bearer ${fixture.token}`)
        .expect("Content-Type", /json/)
        .expect(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.headers["content-disposition"]).toBeUndefined();
    }
  });

  it("isolates tenants in the export and in the owners list", async () => {
    const fixture = await createFixture("tenant-a");
    const seller = await addMember(fixture, "SELLER", "tenant-a");
    const data = await createSalesData(fixture, seller.user.id);
    const other = await createFixture("tenant-b");

    const theirs = await exportCsv(other.token);
    expect(theirs.body).not.toContain("LIC");
    expect(theirs.body).not.toContain("HYPERLINK");
    expect(theirs.lines).toHaveLength(2);

    const crossPipeline = await exportCsv(
      other.token,
      `?pipelineId=${data.pipelineA.id}&ownerUserId=${fixture.user.id}`
    );
    expect(crossPipeline.lines).toHaveLength(2);

    const otherOwners = await request(app.getHttpServer())
      .get(OWNERS_URL)
      .set("Authorization", `Bearer ${other.token}`)
      .expect(200);
    expect(otherOwners.body).toEqual([]);
  });

  it("lists opportunity owners without e-mail for the owner filter", async () => {
    const fixture = await createFixture("owners");
    const seller = await addMember(fixture, "SELLER", "owners");
    const manager = await addMember(fixture, "MANAGER", "owners");
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

    const response = await request(app.getHttpServer())
      .get(OWNERS_URL)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(200);
    const owners = SalesByProductOwnersSchema.parse(response.body);

    // O MANAGER não é dono de oportunidade, então não aparece.
    expect(owners).toEqual([
      {
        userId: fixture.user.id,
        displayName: "Admin owners",
        membershipActive: true,
      },
      {
        userId: seller.user.id,
        displayName: "SELLER owners",
        membershipActive: false,
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("@example.test");

    await request(app.getHttpServer())
      .get(`${OWNERS_URL}?organizationId=${fixture.organization.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(400);
  });

  it("enforces reports.read on export and owners", async () => {
    const fixture = await createFixture("rbac");
    const manager = await addMember(fixture, "MANAGER", "rbac");
    const seller = await addMember(fixture, "SELLER", "rbac");
    const viewer = await addMember(fixture, "VIEWER", "rbac");
    await createSalesData(fixture, seller.user.id);

    const adminCsv = await exportCsv(fixture.token);
    const managerCsv = await exportCsv(manager.token);
    expect(managerCsv.body).toBe(adminCsv.body);

    for (const url of [EXPORT_URL, OWNERS_URL]) {
      for (const token of [seller.token, viewer.token]) {
        const response = await request(app.getHttpServer())
          .get(url)
          .set("Authorization", `Bearer ${token}`)
          .expect(403);
        expect(response.headers["content-disposition"]).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain("Licença");
      }
      await request(app.getHttpServer()).get(url).expect(401);
    }
  });
});

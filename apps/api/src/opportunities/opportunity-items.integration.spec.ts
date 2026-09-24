import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.3.1 opportunity items API", () => {
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

  async function createUser(input: {
    email: string;
    password: string;
    displayName: string;
  }) {
    return prisma.user.create({
      data: {
        email: input.email,
        emailNormalized: input.email.toLowerCase(),
        displayName: input.displayName,
        passwordHash: await passwords.hash(input.password),
      },
    });
  }

  async function login(input: {
    email: string;
    password: string;
    organizationSlug: string;
  }): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send(input)
      .expect(200);

    return response.body.accessToken as string;
  }

  async function createFixture(suffix = "base") {
    const organization = await prisma.organization.create({
      data: {
        name: `Opportunity Organization ${suffix}`,
        slug: `opportunity-org-${suffix}`,
      },
    });
    const password = "Strong-Opportunity-Password-2026!";
    const user = await createUser({
      email: `opportunity-admin-${suffix}@example.test`,
      password,
      displayName: `Opportunity Admin ${suffix}`,
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Opportunity ${suffix}`,
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const contact = await prisma.withTenant(organization.id, tenant =>
      tenant.contact.create({
        data: {
          organizationId: organization.id,
          fullName: `Contato Opportunity ${suffix}`,
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );

    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });

    const pipeline = await request(app.getHttpServer())
      .post("/api/v1/pipelines/default")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const stage = pipeline.body.stages[0] as { id: string };
    const secondStage = pipeline.body.stages[1] as { id: string };

    return {
      organization,
      user,
      company,
      contact,
      token,
      pipelineId: pipeline.body.id as string,
      stageId: stage.id,
      secondStageId: secondStage.id,
    };
  }

  async function createOpportunity(
    fixture: Awaited<ReturnType<typeof createFixture>>
  ) {
    return request(app.getHttpServer())
      .post("/api/v1/opportunities")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c3-6-2-opportunity-create")
      .send({
        pipelineId: fixture.pipelineId,
        stageId: fixture.stageId,
        companyId: fixture.company.id,
        ownerUserId: fixture.user.id,
        title: "Contrato Enterprise",
        estimatedValue: "150000.00",
      })
      .expect(201);
  }

  async function createProduct(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    body: Record<string, unknown>
  ) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(body)
      .expect(201);
    return response.body as { id: string };
  }

  const itemsUrl = (opportunityId: string, itemId?: string) =>
    `/api/v1/opportunities/${opportunityId}/items${itemId ? `/${itemId}` : ""}`;

  it("adds, updates and removes items recalculating value and version with audit", async () => {
    const fixture = await createFixture("items");
    const opportunity = (await createOpportunity(fixture)).body as {
      id: string;
      version: number;
    };
    const license = await createProduct(fixture, {
      code: "LIC",
      name: "Licença",
      unitPrice: "100.00",
    });
    const service = await createProduct(fixture, {
      code: "IMPL",
      name: "Implantação",
      unitPrice: "2500.00",
    });

    const first = await request(app.getHttpServer())
      .post(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c4-3-1-items")
      .send({
        productId: license.id,
        quantity: "10",
        discountPercent: "12.5",
        version: 1,
      })
      .expect(201);
    expect(first.body.item).toMatchObject({
      description: "Licença",
      quantity: "10.000",
      unitPrice: "100.00",
      discountPercent: "12.50",
      lineTotal: "875.00",
    });
    expect(first.body.opportunity).toMatchObject({
      estimatedValue: "875.00",
      version: 2,
    });

    const second = await request(app.getHttpServer())
      .post(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c4-3-1-items")
      .send({
        productId: service.id,
        quantity: "1",
        unitPrice: "2000.00",
        version: 2,
      })
      .expect(201);
    expect(second.body.item.lineTotal).toBe("2000.00");
    expect(second.body.opportunity).toMatchObject({
      estimatedValue: "2875.00",
      version: 3,
    });

    const updated = await request(app.getHttpServer())
      .patch(itemsUrl(opportunity.id, first.body.item.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c4-3-1-items")
      .send({ quantity: "3.5", discountPercent: "0", version: 3 })
      .expect(200);
    expect(updated.body.item.lineTotal).toBe("350.00");
    expect(updated.body.opportunity).toMatchObject({
      estimatedValue: "2350.00",
      version: 4,
    });

    const listed = await request(app.getHttpServer())
      .get(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(listed.body.items).toHaveLength(2);

    const removed = await request(app.getHttpServer())
      .delete(`${itemsUrl(opportunity.id, second.body.item.id)}?version=4`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("x-request-id", "c4-3-1-items")
      .expect(200);
    expect(removed.body.opportunity).toMatchObject({
      estimatedValue: "350.00",
      version: 5,
    });

    const audit = await prisma.withTenant(fixture.organization.id, tenant =>
      tenant.auditLog.findMany({
        where: {
          organizationId: fixture.organization.id,
          requestId: "c4-3-1-items",
        },
        select: { action: true, metadata: true },
        orderBy: { createdAt: "asc" },
      })
    );
    expect(audit.map(entry => entry.action)).toEqual([
      "opportunity.item_added",
      "opportunity.item_added",
      "opportunity.item_updated",
      "opportunity.item_removed",
    ]);
    expect(audit[3]?.metadata).toMatchObject({
      previousEstimatedValue: "2350.00",
      estimatedValue: "350.00",
      previousVersion: 4,
      version: 5,
    });
  });

  it("rejects a stale version without persisting the item", async () => {
    const fixture = await createFixture("stale");
    const opportunity = (await createOpportunity(fixture)).body as {
      id: string;
    };
    const product = await createProduct(fixture, {
      code: "P",
      name: "Produto",
      unitPrice: "10.00",
    });

    await request(app.getHttpServer())
      .post(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ productId: product.id, quantity: "1", version: 7 })
      .expect(409);

    const count = await prisma.withTenant(fixture.organization.id, tenant =>
      tenant.opportunityItem.count({
        where: { organizationId: fixture.organization.id },
      })
    );
    expect(count).toBe(0);

    const read = await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunity.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(read.body).toMatchObject({
      estimatedValue: "150000.00",
      version: 1,
    });
  });

  it("refuses inactive, deleted and cross-tenant products", async () => {
    const fixture = await createFixture("refuse");
    const other = await createFixture("refuse-other");
    const opportunity = (await createOpportunity(fixture)).body as {
      id: string;
    };

    const inactive = await createProduct(fixture, {
      code: "INA",
      name: "Inativo",
      unitPrice: "1.00",
      isActive: false,
    });
    const deleted = await createProduct(fixture, {
      code: "DEL",
      name: "Excluído",
      unitPrice: "1.00",
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/products/${deleted.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(204);
    const foreign = await createProduct(other, {
      code: "FOR",
      name: "Outro tenant",
      unitPrice: "1.00",
    });

    for (const productId of [inactive.id, deleted.id, foreign.id]) {
      await request(app.getHttpServer())
        .post(itemsUrl(opportunity.id))
        .set("Authorization", `Bearer ${fixture.token}`)
        .send({ productId, quantity: "1", version: 1 })
        .expect(404);
    }

    // Other tenant cannot see or change this opportunity's items.
    await request(app.getHttpServer())
      .get(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${other.token}`)
      .expect(404);
  });

  it("keeps the value derived while items exist and editable again after removing all", async () => {
    const fixture = await createFixture("derived");
    const opportunity = (await createOpportunity(fixture)).body as {
      id: string;
    };
    const product = await createProduct(fixture, {
      code: "D",
      name: "Derivado",
      unitPrice: "40.00",
    });

    const added = await request(app.getHttpServer())
      .post(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ productId: product.id, quantity: "2", version: 1 })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunity.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ estimatedValue: "1.00", version: 2 })
      .expect(400);
    expect(JSON.stringify(blocked.body)).toContain("OPPORTUNITY_VALUE_DERIVED");

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunity.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ title: "Título ainda editável", version: 2 })
      .expect(200);

    const removed = await request(app.getHttpServer())
      .delete(`${itemsUrl(opportunity.id, added.body.item.id)}?version=3`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(removed.body.opportunity).toMatchObject({
      estimatedValue: "0.00",
      version: 4,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunity.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ estimatedValue: "500.00", version: 4 })
      .expect(200);
  });

  it("validates item payloads", async () => {
    const fixture = await createFixture("item-validation");
    const opportunity = (await createOpportunity(fixture)).body as {
      id: string;
    };
    const product = await createProduct(fixture, {
      code: "V",
      name: "Validação",
      unitPrice: "1.00",
    });

    for (const body of [
      { productId: product.id, quantity: "0", version: 1 },
      { productId: product.id, quantity: "-1", version: 1 },
      {
        productId: product.id,
        quantity: "1",
        discountPercent: "100.01",
        version: 1,
      },
      { productId: product.id, quantity: "1", total: "9", version: 1 },
    ]) {
      await request(app.getHttpServer())
        .post(itemsUrl(opportunity.id))
        .set("Authorization", `Bearer ${fixture.token}`)
        .send(body)
        .expect(400);
    }

    const huge = await createProduct(fixture, {
      code: "HUGE",
      name: "Muito caro",
      unitPrice: "99999999999999999.99",
    });
    const overflow = await request(app.getHttpServer())
      .post(itemsUrl(opportunity.id))
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ productId: huge.id, quantity: "10", version: 1 })
      .expect(400);
    expect(JSON.stringify(overflow.body)).toContain(
      "OPPORTUNITY_VALUE_TOO_LARGE"
    );

    await request(app.getHttpServer())
      .delete(`${itemsUrl(opportunity.id, product.id)}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(400);
  });
});

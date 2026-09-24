import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.3 products API", () => {
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

  async function createSession(
    role: "ADMIN" | "MANAGER" | "SELLER" | "VIEWER",
    suffix: string
  ) {
    const organization = await prisma.organization.create({
      data: { name: `Products ${suffix}`, slug: `products-${suffix}` },
    });
    const password = "Strong-Products-Password-2026!";
    const user = await createUser({
      email: `products-${suffix}@example.test`,
      password,
      displayName: `Products ${suffix}`,
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });
    return { organization, user, token };
  }

  const createProduct = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "c4-3-product")
      .send(body);

  it("creates, reads, lists, updates and soft-deletes a product with audit", async () => {
    const { organization, token } = await createSession("ADMIN", "crud");

    const created = await createProduct(token, {
      code: "LIC-PBX",
      name: "Licença PABX IP",
      unitPrice: "1200.50",
    }).expect(201);
    expect(created.body).toMatchObject({
      code: "LIC-PBX",
      name: "Licença PABX IP",
      unitPrice: "1200.50",
      isActive: true,
      version: 1,
    });
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get("/api/v1/products?q=pabx&active=true")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body).toMatchObject({ total: 1 });

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ unitPrice: "999.90", isActive: false, version: 1 })
      .expect(200);
    expect(updated.body).toMatchObject({
      unitPrice: "999.90",
      isActive: false,
      version: 2,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Stale", version: 1 })
      .expect(409);

    const inactive = await request(app.getHttpServer())
      .get("/api/v1/products?active=true")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(inactive.body.total).toBe(0);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    const actions = await prisma.withTenant(organization.id, tenant =>
      tenant.auditLog.findMany({
        where: { organizationId: organization.id, entityType: "product" },
        select: { action: true },
        orderBy: { createdAt: "asc" },
      })
    );
    expect(actions.map(entry => entry.action)).toEqual([
      "product.created",
      "product.updated",
      "product.deleted",
    ]);
  });

  it("enforces case-insensitive unique codes per tenant only", async () => {
    const tenantA = await createSession("ADMIN", "code-a");
    const tenantB = await createSession("ADMIN", "code-b");

    await createProduct(tenantA.token, {
      code: "SVC-01",
      name: "Serviço",
      unitPrice: "10.00",
    }).expect(201);
    const duplicate = await createProduct(tenantA.token, {
      code: "svc-01",
      name: "Outro",
      unitPrice: "10.00",
    }).expect(409);
    expect(duplicate.body.code ?? duplicate.body.error?.code).toBeDefined();

    await createProduct(tenantB.token, {
      code: "SVC-01",
      name: "Serviço do tenant B",
      unitPrice: "10.00",
    }).expect(201);

    const listA = await request(app.getHttpServer())
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.total).toBe(1);
  });

  it("allows reuse of a code after the product is deleted", async () => {
    const { token } = await createSession("ADMIN", "reuse");
    const first = await createProduct(token, {
      code: "OLD",
      name: "Antigo",
      unitPrice: "1.00",
    }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/products/${first.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    await createProduct(token, {
      code: "OLD",
      name: "Novo",
      unitPrice: "2.00",
    }).expect(201);
  });

  it("lets every role read the catalog but only ADMIN/MANAGER write it", async () => {
    const manager = await createSession("MANAGER", "manager");
    const seller = await createSession("SELLER", "seller");
    const viewer = await createSession("VIEWER", "viewer");

    await createProduct(manager.token, {
      code: "M-1",
      name: "Produto do gerente",
      unitPrice: "5.00",
    }).expect(201);

    for (const session of [seller, viewer]) {
      await request(app.getHttpServer())
        .get("/api/v1/products")
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      await createProduct(session.token, {
        code: "X",
        name: "Bloqueado",
        unitPrice: "1.00",
      }).expect(403);
    }
  });

  it("validates payloads", async () => {
    const { token } = await createSession("ADMIN", "validation");
    await createProduct(token, { code: "", name: "x", unitPrice: "1" }).expect(
      400
    );
    await createProduct(token, {
      code: "NEG",
      name: "x",
      unitPrice: "-1.00",
    }).expect(400);
    await request(app.getHttpServer())
      .get("/api/v1/products/not-a-uuid")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});

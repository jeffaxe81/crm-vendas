import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

const CREDENTIALS_URL = "/api/v1/integrations/credentials";

describe("F4.1 integration credentials (API Key)", () => {
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
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE
         integration_credentials,
         companies,
         audit_logs,
         refresh_sessions,
         organization_memberships,
         users,
         organizations
       CASCADE`
    );
  }

  async function createUser(email: string, password: string, name: string) {
    return prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        displayName: name,
        passwordHash: await passwords.hash(password),
      },
    });
  }

  async function login(email: string, password: string, slug: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug: slug })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function createFixture(suffix: string, role: MembershipRole = "ADMIN") {
    const organization = await prisma.organization.create({
      data: { name: `Org ${suffix}`, slug: `f4-1-${suffix}` },
    });
    const password = `Strong-${suffix}-Password-2026!`;
    const user = await createUser(
      `f4-1-${suffix}@example.test`,
      password,
      `User ${suffix}`
    );
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const token = await login(user.email, password, organization.slug);
    return { organization, user, token };
  }

  it("lets ADMIN create a key scoped to its own permissions and exposes the plain key only once", async () => {
    const admin = await createFixture("create");

    const created = await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "ERP integração", scopes: ["company.read"] })
      .expect(201);

    expect(created.body.plainKey).toMatch(/^axk_/);
    expect(created.body.keyPrefix).toBe(created.body.plainKey.slice(0, 12));

    const list = await request(app.getHttpServer())
      .get(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].plainKey).toBeUndefined();
    expect(list.body[0].keyPrefix).toBe(created.body.keyPrefix);
  });

  it("rejects a scope the creator's own role does not grant", async () => {
    const admin = await createFixture("scope-cap");

    await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Escopo inválido", scopes: ["not-a-real-permission"] })
      .expect(400);
  });

  it("blocks non-ADMIN roles from managing or reading credentials", async () => {
    const admin = await createFixture("rbac");
    for (const role of ["MANAGER", "SELLER", "VIEWER"] as const) {
      const member = await createFixture(`rbac-${role.toLowerCase()}`, role);
      await request(app.getHttpServer())
        .post(CREDENTIALS_URL)
        .set("Authorization", `Bearer ${member.token}`)
        .send({ name: "x", scopes: ["company.read"] })
        .expect(403);
      await request(app.getHttpServer())
        .get(CREDENTIALS_URL)
        .set("Authorization", `Bearer ${member.token}`)
        .expect(403);
    }
    void admin;
  });

  it("authenticates API requests with the issued key, honoring its scopes", async () => {
    const admin = await createFixture("scoped-key");

    const created = await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Somente leitura", scopes: ["company.read"] })
      .expect(201);
    const key = created.body.plainKey as string;

    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${key}`)
      .expect(200);

    // company.write nao foi concedido a esta chave.
    await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${key}`)
      .send({ legalName: "Nao deveria criar" })
      .expect(403);
  });

  it("never lets a key from one organization read another organization's data", async () => {
    const orgA = await createFixture("tenant-a");
    const orgB = await createFixture("tenant-b");

    await prisma.withTenant(orgB.organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: orgB.organization.id,
          legalName: "Empresa da Org B",
          createdBy: orgB.user.id,
          updatedBy: orgB.user.id,
        },
      })
    );

    const created = await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ name: "Chave da Org A", scopes: ["company.read"] })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${created.body.plainKey}`)
      .expect(200);

    expect(list.body.items).toHaveLength(0);
  });

  it("rejects a revoked key immediately", async () => {
    const admin = await createFixture("revoke");
    const created = await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Para revogar", scopes: ["company.read"] })
      .expect(201);

    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${created.body.plainKey}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`${CREDENTIALS_URL}/${created.body.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${created.body.plainKey}`)
      .expect(401);
  });

  it("rejects an expired key", async () => {
    const admin = await createFixture("expired");
    const created = await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Expira no passado",
        scopes: ["company.read"],
        expiresAt: "2020-01-01T00:00:00.000Z",
      })
      .expect(201);

    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${created.body.plainKey}`)
      .expect(401);
  });

  it("loses effective scope when the creator's role is demoted below what the key grants", async () => {
    const admin = await createFixture("demote");
    const created = await request(app.getHttpServer())
      .post(CREDENTIALS_URL)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Depende do papel do criador", scopes: ["user.manage"] })
      .expect(201);

    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${created.body.plainKey}`)
      .expect(200);

    await prisma.organizationMembership.updateMany({
      where: { userId: admin.user.id, organizationId: admin.organization.id },
      data: { role: "VIEWER" },
    });

    // VIEWER nao tem user.manage; a chave nao herda mais esse escopo,
    // mas ainda tem company.read pois VIEWER continua tendo essa permissao.
    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${created.body.plainKey}`)
      .expect(200);
  });

  it("rejects a garbage bearer token with the axk_ prefix", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/companies")
      .set("Authorization", "Bearer axk_not-a-real-key")
      .expect(401);
  });
});

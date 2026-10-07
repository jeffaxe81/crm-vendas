import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.1.6 territories API", () => {
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
         territory_metrics,
         territory_targets,
         territory_quotas,
         territories,
         companies,
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

  async function createOrgWithAdmin(slug: string) {
    const organization = await prisma.organization.create({
      data: { name: `Org ${slug}`, slug },
    });
    const password = `Strong-${slug}-Password-2026!`;
    const user = await createUser({
      email: `${slug}@example.test`,
      password,
      displayName: `Admin ${slug}`,
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });
    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });
    return { organization, user, token };
  }

  it("isolates territories between organizations", async () => {
    const orgA = await createOrgWithAdmin("territory-org-a");
    const orgB = await createOrgWithAdmin("territory-org-b");

    const territoryA = await prisma.withTenant(orgA.organization.id, tenant =>
      tenant.territory.create({
        data: {
          organizationId: orgA.organization.id,
          name: "Território Norte",
          region: "Norte",
          createdBy: orgA.user.id,
          updatedBy: orgA.user.id,
        },
      })
    );
    const territoryB = await prisma.withTenant(orgB.organization.id, tenant =>
      tenant.territory.create({
        data: {
          organizationId: orgB.organization.id,
          name: "Território Sul",
          region: "Sul",
          createdBy: orgB.user.id,
          updatedBy: orgB.user.id,
        },
      })
    );

    const list = await request(app.getHttpServer())
      .get("/api/v1/territories")
      .set("Authorization", `Bearer ${orgA.token}`)
      .expect(200);

    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(territoryA.id);

    await request(app.getHttpServer())
      .get(`/api/v1/territories/${territoryB.id}`)
      .set("Authorization", `Bearer ${orgA.token}`)
      .expect(404);
  });

  it("blocks territory writes for VIEWER memberships", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Viewer Org", slug: "territory-viewer-org" },
    });
    const password = "Strong-Viewer-Password-2026!";
    const user = await createUser({
      email: "territory-viewer@example.test",
      password,
      displayName: "Territory Viewer",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "VIEWER",
      },
    });
    const token = await login({
      email: user.email,
      password,
      organizationSlug: organization.slug,
    });

    await request(app.getHttpServer())
      .post("/api/v1/territories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Não autorizado", region: "Sul" })
      .expect(403);
  });

  it("lists assignable sales reps and blocks cross-organization assignment", async () => {
    const orgA = await createOrgWithAdmin("territory-sales-reps-a");
    const orgB = await createOrgWithAdmin("territory-sales-reps-b");
    const seller = await createUser({
      email: "seller-territory@example.test",
      password: "Strong-Seller-Password-2026!",
      displayName: "Seller Territory",
    });
    const viewer = await createUser({
      email: "viewer-territory@example.test",
      password: "Strong-Viewer-Territory-2026!",
      displayName: "Viewer Territory",
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: orgA.organization.id,
          userId: seller.id,
          role: "SELLER",
        },
        {
          organizationId: orgA.organization.id,
          userId: viewer.id,
          role: "VIEWER",
        },
      ],
    });

    const options = await request(app.getHttpServer())
      .get("/api/v1/territories/sales-reps")
      .set("Authorization", `Bearer ${orgA.token}`)
      .expect(200);

    expect(options.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: seller.id,
          displayName: "Seller Territory",
          role: "SELLER",
        }),
      ])
    );
    expect(
      options.body.some((item: { id: string }) => item.id === viewer.id)
    ).toBe(false);
    expect(
      options.body.some((item: { id: string }) => item.id === orgB.user.id)
    ).toBe(false);

    const created = await request(app.getHttpServer())
      .post("/api/v1/territories")
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ name: "Território Seguro", region: "Sul" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${created.body.id}/reassign`)
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ salesRepId: orgB.user.id })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/territories/${created.body.id}`)
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ salesRepId: viewer.id })
      .expect(404);
  });

  it("creates, updates, reassigns and soft-deletes a territory with audit records", async () => {
    const org = await createOrgWithAdmin("territory-lifecycle-org");
    const salesRep = await createUser({
      email: "rep-lifecycle@example.test",
      password: "Strong-Rep-Password-2026!",
      displayName: "Sales Rep",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org.organization.id,
        userId: salesRep.id,
        role: "SELLER",
      },
    });

    const created = await request(app.getHttpServer())
      .post("/api/v1/territories")
      .set("Authorization", `Bearer ${org.token}`)
      .set("x-request-id", "territory-create")
      .send({ name: "Território Criado", region: "Centro-Oeste" })
      .expect(201);

    const territoryId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/territories/${territoryId}`)
      .set("Authorization", `Bearer ${org.token}`)
      .set("x-request-id", "territory-update")
      .send({ description: "Atualizado" })
      .expect(200);
    expect(updated.body.description).toBe("Atualizado");

    const reassigned = await request(app.getHttpServer())
      .post(`/api/v1/territories/${territoryId}/reassign`)
      .set("Authorization", `Bearer ${org.token}`)
      .set("x-request-id", "territory-reassign")
      .send({ salesRepId: salesRep.id })
      .expect(201);
    expect(reassigned.body.salesRepId).toBe(salesRep.id);

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${territoryId}/reassign`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ salesRepId: salesRep.id })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/territories/${territoryId}`)
      .set("Authorization", `Bearer ${org.token}`)
      .set("x-request-id", "territory-delete")
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/territories/${territoryId}`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(404);

    const auditActions = await prisma.auditLog.findMany({
      where: { organizationId: org.organization.id, entityId: territoryId },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(auditActions.map(item => item.action)).toEqual([
      "territory.created",
      "territory.updated",
      "territory.reassigned",
      "territory.deleted",
    ]);
  });

  it("manages coverage targets for a territory", async () => {
    const org = await createOrgWithAdmin("territory-coverage-org");
    const territory = await prisma.withTenant(org.organization.id, tenant =>
      tenant.territory.create({
        data: {
          organizationId: org.organization.id,
          name: "Território Cobertura",
          region: "Nordeste",
          createdBy: org.user.id,
          updatedBy: org.user.id,
        },
      })
    );
    const company = await prisma.withTenant(org.organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: org.organization.id,
          legalName: "Empresa Alvo",
          createdBy: org.user.id,
          updatedBy: org.user.id,
        },
      })
    );

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${territory.id}/coverage/add`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ companyId: company.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${territory.id}/coverage/add`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ companyId: company.id })
      .expect(409);

    const coverage = await request(app.getHttpServer())
      .get(`/api/v1/territories/${territory.id}/coverage`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(coverage.body).toHaveLength(1);
    expect(coverage.body[0].companyId).toBe(company.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/territories/${territory.id}/coverage/${company.id}`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ coverageStatus: "COVERED" })
      .expect(200);

    const metrics = await request(app.getHttpServer())
      .get(`/api/v1/territories/${territory.id}/metrics`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(metrics.body.targetCount).toBe(1);
    expect(metrics.body.coveredCount).toBe(1);
    expect(Number(metrics.body.coveragePercentage)).toBe(100);

    await request(app.getHttpServer())
      .delete(`/api/v1/territories/${territory.id}/coverage/${company.id}`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/api/v1/territories/${territory.id}/coverage/${company.id}`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(404);
  });

  it("tracks quota progress per period and year", async () => {
    const org = await createOrgWithAdmin("territory-quota-org");
    const territory = await prisma.withTenant(org.organization.id, tenant =>
      tenant.territory.create({
        data: {
          organizationId: org.organization.id,
          name: "Território Quota",
          region: "Sudeste",
          createdBy: org.user.id,
          updatedBy: org.user.id,
        },
      })
    );

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${territory.id}/quotas`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ period: "MONTH", year: 2026, amount: 10000, actual: 4000 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${territory.id}/quotas`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ period: "MONTH", year: 2026, amount: 12000, actual: 6000 })
      .expect(201);

    const quotas = await request(app.getHttpServer())
      .get(`/api/v1/territories/${territory.id}/quotas?period=MONTH&year=2026`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);

    expect(quotas.body).toHaveLength(1);
    expect(Number(quotas.body[0].amount)).toBe(12000);
    expect(Number(quotas.body[0].actual)).toBe(6000);

    await request(app.getHttpServer())
      .post(`/api/v1/territories/${territory.id}/quotas`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ amount: -1, period: "MONTH", year: 2026 })
      .expect(400);
  });
});

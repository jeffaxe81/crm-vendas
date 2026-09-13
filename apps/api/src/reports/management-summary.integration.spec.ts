import { jest } from "@jest/globals";
import { ManagementSummarySchema } from "@axes/contracts";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type MembershipRole = "ADMIN" | "MANAGER" | "SELLER" | "VIEWER";

describe("C4.1.1 management summary API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = moduleRef.get(PrismaService);
    passwords = moduleRef.get(PasswordService);
  });

  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE opportunities, activities, contact_custom_field_values,
       company_custom_field_values, custom_field_definitions, contact_tags,
       company_tags, tags, relationship_entries, company_contacts,
       contact_channels, contacts, companies, pipeline_stages, pipelines,
       audit_logs, refresh_sessions, organization_memberships, users,
       organizations CASCADE`
    );
  }

  async function createUser(email: string, password: string, displayName: string) {
    return prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        displayName,
        passwordHash: await passwords.hash(password),
      },
    });
  }

  async function login(email: string, password: string, organizationSlug: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function createFixture(suffix: string) {
    const organization = await prisma.organization.create({
      data: {
        name: `Management Summary Organization ${suffix}`,
        slug: `management-summary-${suffix}`,
      },
    });
    const password = "Strong-Management-Summary-Password-2026!";
    const user = await createUser(
      `management-summary-admin-${suffix}@example.test`,
      password,
      `Management Summary Admin ${suffix}`
    );
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });
    const company = await prisma.withTenant(organization.id, tenant =>
      tenant.company.create({
        data: {
          organizationId: organization.id,
          legalName: `Cliente Management Summary ${suffix}`,
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    );
    const token = await login(user.email, password, organization.slug);
    return { organization, user, company, token };
  }

  async function addMember(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    role: MembershipRole,
    suffix: string
  ) {
    const password = `Strong-${role}-Password-2026!`;
    const user = await createUser(
      `management-summary-${role.toLowerCase()}-${suffix}@example.test`,
      password,
      `${role} ${suffix}`
    );
    await prisma.organizationMembership.create({
      data: { organizationId: fixture.organization.id, userId: user.id, role },
    });
    return { user, token: await login(user.email, password, fixture.organization.slug) };
  }

  async function createPipelineData(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    suffix: string,
    largeValues = false
  ) {
    return prisma.withTenant(fixture.organization.id, async tenant => {
      const pipelineA = await tenant.pipeline.create({
        data: {
          organizationId: fixture.organization.id,
          name: `Funil A ${suffix}`,
          normalizedName: `funil-a-${suffix}`,
        },
      });
      const pipelineB = await tenant.pipeline.create({
        data: {
          organizationId: fixture.organization.id,
          name: `Funil B ${suffix}`,
          normalizedName: `funil-b-${suffix}`,
        },
      });
      const openA = await tenant.pipelineStage.create({
        data: {
          organizationId: fixture.organization.id,
          pipelineId: pipelineA.id,
          name: "Qualificação",
          position: 1,
          kind: "OPEN",
        },
      });
      const won = await tenant.pipelineStage.create({
        data: {
          organizationId: fixture.organization.id,
          pipelineId: pipelineA.id,
          name: "Ganho",
          position: 2,
          kind: "WON",
        },
      });
      const lost = await tenant.pipelineStage.create({
        data: {
          organizationId: fixture.organization.id,
          pipelineId: pipelineA.id,
          name: "Perdido",
          position: 3,
          kind: "LOST",
        },
      });
      const openInactive = await tenant.pipelineStage.create({
        data: {
          organizationId: fixture.organization.id,
          pipelineId: pipelineB.id,
          name: "Qualificação",
          position: 1,
          kind: "OPEN",
          isActive: false,
        },
      });
      const base = {
        organizationId: fixture.organization.id,
        companyId: fixture.company.id,
        ownerUserId: fixture.user.id,
        createdBy: fixture.user.id,
        updatedBy: fixture.user.id,
      };

      if (largeValues) {
        await tenant.opportunity.createMany({
          data: [
            { ...base, pipelineId: pipelineA.id, stageId: openA.id, title: "Valor grande 1", estimatedValue: "90000000000000000.10" },
            { ...base, pipelineId: pipelineA.id, stageId: openA.id, title: "Valor grande 2", estimatedValue: "0.20" },
          ],
        });
        return { pipelineA, pipelineB, openA, openInactive, won, lost };
      }

      await tenant.opportunity.createMany({
        data: [
          { ...base, pipelineId: pipelineA.id, stageId: openA.id, title: "Aberta 0.10", estimatedValue: "0.10" },
          { ...base, pipelineId: pipelineB.id, stageId: openInactive.id, title: "Aberta 0.20", estimatedValue: "0.20" },
          { ...base, pipelineId: pipelineA.id, stageId: won.id, title: "Ganha", estimatedValue: "500.00" },
          { ...base, pipelineId: pipelineA.id, stageId: lost.id, title: "Perdida", estimatedValue: "600.00" },
          { ...base, pipelineId: pipelineA.id, stageId: openA.id, title: "Excluída", estimatedValue: "900.00", deletedAt: new Date(), deletedBy: fixture.user.id },
        ],
      });
      await tenant.opportunity.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          ...base,
          pipelineId: pipelineA.id,
          stageId: openA.id,
          title: `Oportunidade paginação ${index + 1}`,
          estimatedValue: "0.00",
        })),
      });

      const now = Date.now();
      const activityBase = {
        organizationId: fixture.organization.id,
        type: "TASK" as const,
        companyId: fixture.company.id,
        ownerUserId: fixture.user.id,
        createdBy: fixture.user.id,
        updatedBy: fixture.user.id,
      };
      await tenant.activity.createMany({
        data: [
          { ...activityBase, status: "PENDING", title: "Pendente vencida", dueAt: new Date(now - 60_000) },
          { ...activityBase, status: "PENDING", title: "Pendente futura", dueAt: new Date(now + 3_600_000) },
          { ...activityBase, status: "PENDING", title: "Pendente sem prazo", dueAt: null },
          { ...activityBase, status: "COMPLETED", title: "Concluída", dueAt: new Date(now - 60_000), completedAt: new Date(now - 30_000) },
          { ...activityBase, status: "CANCELLED", title: "Cancelada", dueAt: new Date(now - 60_000), cancelledAt: new Date(now - 30_000) },
          { ...activityBase, status: "PENDING", title: "Pendente excluída", dueAt: new Date(now - 60_000), deletedAt: new Date(now - 30_000), deletedBy: fixture.user.id },
        ],
      });
      return { pipelineA, pipelineB, openA, openInactive, won, lost };
    });
  }

  it("returns an empty schema-valid management summary for an administrator", async () => {
    const fixture = await createFixture("empty");
    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/management-summary")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect("Content-Type", /json/)
      .expect(200);
    expect(response.body).toMatchObject({
      opportunitiesByStage: [],
      openEstimatedValue: "0.00",
      pendingActivities: 0,
      overdueActivities: 0,
      undatedActivities: 0,
    });
    expect(() => ManagementSummarySchema.parse(response.body)).not.toThrow();
  });

  it("calculates the snapshot without pagination leakage and isolates another tenant", async () => {
    const fixture = await createFixture("aggregate-a");
    const manager = await addMember(fixture, "MANAGER", "aggregate-a");
    const data = await createPipelineData(fixture, "aggregate-a");
    const other = await createFixture("aggregate-b");
    const otherData = await createPipelineData(other, "aggregate-b", true);

    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/management-summary")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    const parsed = ManagementSummarySchema.parse(response.body);
    expect(parsed.openEstimatedValue).toBe("0.30");
    expect(parsed.pendingActivities).toBe(3);
    expect(parsed.overdueActivities).toBe(1);
    expect(parsed.undatedActivities).toBe(1);
    expect(parsed.opportunitiesByStage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pipelineId: data.pipelineA.id, stageId: data.openA.id, stageName: "Qualificação", count: 102 }),
        expect.objectContaining({ pipelineId: data.pipelineB.id, stageId: data.openInactive.id, stageName: "Qualificação", count: 1 }),
        expect.objectContaining({ stageId: data.won.id, count: 1 }),
        expect.objectContaining({ stageId: data.lost.id, count: 1 }),
      ])
    );
    expect(parsed.opportunitiesByStage).toHaveLength(4);
    expect(parsed.opportunitiesByStage.some(item =>
      item.pipelineId === otherData.pipelineA.id ||
      item.pipelineId === otherData.pipelineB.id ||
      item.stageId === otherData.openA.id ||
      item.stageId === otherData.openInactive.id
    )).toBe(false);

    const managerResponse = await request(app.getHttpServer())
      .get("/api/v1/reports/management-summary")
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(200);
    const managerParsed = ManagementSummarySchema.parse(managerResponse.body);
    const { asOf: _adminAsOf, ...adminSnapshot } = parsed;
    const { asOf: _managerAsOf, ...managerSnapshot } = managerParsed;
    expect(managerSnapshot).toEqual(adminSnapshot);
  });

  it("enforces report authorization and rejects tenant/query injection", async () => {
    const fixture = await createFixture("rbac");
    const manager = await addMember(fixture, "MANAGER", "rbac");
    const seller = await addMember(fixture, "SELLER", "rbac");
    const viewer = await addMember(fixture, "VIEWER", "rbac");
    const other = await createFixture("rbac-other");

    for (const token of [fixture.token, manager.token]) {
      await request(app.getHttpServer()).get("/api/v1/reports/management-summary").set("Authorization", `Bearer ${token}`).expect(200);
    }
    for (const token of [seller.token, viewer.token]) {
      await request(app.getHttpServer()).get("/api/v1/reports/management-summary").set("Authorization", `Bearer ${token}`).expect(403);
    }
    await request(app.getHttpServer()).get("/api/v1/reports/management-summary").expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/reports/management-summary?organizationId=${other.organization.id}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(400);
  });

  it("preserves exact large decimal sums", async () => {
    const fixture = await createFixture("large-decimal");
    await createPipelineData(fixture, "large-decimal", true);
    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/management-summary")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(response.body.openEstimatedValue).toBe("90000000000000000.30");
    expect(() => ManagementSummarySchema.parse(response.body)).not.toThrow();
  });

  it("treats dueAt equal to asOf as pending but not overdue", async () => {
    const fixture = await createFixture("due-boundary");
    const fixedAsOf = new Date("2020-01-02T03:04:05.000Z");
    await prisma.withTenant(fixture.organization.id, tenant =>
      tenant.activity.create({
        data: {
          organizationId: fixture.organization.id,
          type: "TASK",
          status: "PENDING",
          title: "Exatamente no instante do resumo",
          companyId: fixture.company.id,
          ownerUserId: fixture.user.id,
          dueAt: fixedAsOf,
          createdBy: fixture.user.id,
          updatedBy: fixture.user.id,
        },
      })
    );
    const now = jest.spyOn(Date, "now").mockReturnValue(fixedAsOf.getTime());
    try {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reports/management-summary")
        .set("Authorization", `Bearer ${fixture.token}`)
        .expect(200);
      expect(response.body.asOf).toBe(fixedAsOf.toISOString());
      expect(response.body.pendingActivities).toBe(1);
      expect(response.body.overdueActivities).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it("returns 5xx instead of silent zeroes when the database read fails", async () => {
    const fixture = await createFixture("database-error");
    const withTenant = jest.spyOn(prisma, "withTenant").mockRejectedValueOnce(new Error("forced management summary database error"));
    try {
      await request(app.getHttpServer())
        .get("/api/v1/reports/management-summary")
        .set("Authorization", `Bearer ${fixture.token}`)
        .expect(500);
    } finally {
      withTenant.mockRestore();
    }
  });
});

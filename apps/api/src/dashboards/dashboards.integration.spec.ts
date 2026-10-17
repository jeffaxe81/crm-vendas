import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

type TenantFixture = {
  organizationId: string;
  organizationSlug: string;
  userId: string;
  membershipId: string;
  email: string;
  token: string;
};

describe("Dashboard tenant isolation over HTTP and PostgreSQL RLS", () => {
  let app: INestApplication;
  let admin: PrismaService;
  let restricted: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== "test" ||
      !process.env.MIGRATION_DATABASE_URL ||
      !process.env.RLS_DATABASE_URL
    ) {
      throw new Error("DASHBOARD_INTEGRATION_REQUIRES_ISOLATED_TEST_DATABASE");
    }

    admin = new PrismaService(process.env.MIGRATION_DATABASE_URL);
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(restricted)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    passwords = moduleRef.get(PasswordService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (admin) {
      await admin.$disconnect();
    }
  });

  async function createTenant(index: number): Promise<TenantFixture> {
    const organization = await admin.organization.create({
      data: {
        name: `Dashboard isolation tenant ${index}`,
        slug: `dashboard-isolation-${index}`,
      },
    });
    const email = `dashboard-isolation-${index}@example.test`;
    const password = "Strong-Dashboard-Isolation-2026!";
    const user = await admin.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: `Dashboard Admin ${index}`,
        passwordHash: await passwords.hash(password),
      },
    });
    const membership = await admin.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: false,
      },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, organizationSlug: organization.slug })
      .expect(200);

    return {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      userId: user.id,
      membershipId: membership.id,
      email,
      token: login.body.accessToken as string,
    };
  }

  async function seed(
    tenant: TenantFixture,
    counts: {
      companies: number;
      contacts: number;
      opportunities: number;
      activities: number;
    }
  ): Promise<void> {
    await restricted.withTenant(tenant.organizationId, async database => {
      const organizationId = tenant.organizationId;
      const actor = tenant.userId;
      const company = await database.company.create({
        data: {
          organizationId,
          legalName: `Primary company ${tenant.organizationSlug}`,
          createdBy: actor,
          updatedBy: actor,
        },
      });

      for (let index = 1; index < counts.companies; index++) {
        await database.company.create({
          data: {
            organizationId,
            legalName: `Extra company ${index} ${tenant.organizationSlug}`,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      }

      for (let index = 0; index < counts.contacts; index++) {
        await database.contact.create({
          data: {
            organizationId,
            fullName: `Synthetic contact ${index} ${tenant.organizationSlug}`,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      }

      if (counts.opportunities > 0) {
        const pipeline = await database.pipeline.create({
          data: {
            organizationId,
            name: "Default dashboard pipeline",
            normalizedName: "default-dashboard-pipeline",
          },
        });
        const stage = await database.pipelineStage.create({
          data: {
            organizationId,
            pipelineId: pipeline.id,
            name: "Prospecção",
            position: 1,
            kind: "OPEN",
          },
        });
        for (let index = 0; index < counts.opportunities; index++) {
          await database.opportunity.create({
            data: {
              organizationId,
              companyId: company.id,
              ownerUserId: actor,
              createdBy: actor,
              updatedBy: actor,
              pipelineId: pipeline.id,
              stageId: stage.id,
              title: `Synthetic opportunity ${index}`,
              estimatedValue: "10.00",
            },
          });
        }
      }

      for (let index = 0; index < counts.activities; index++) {
        await database.activity.create({
          data: {
            organizationId,
            companyId: company.id,
            ownerUserId: actor,
            createdBy: actor,
            updatedBy: actor,
            type: "TASK",
            status: "PENDING",
            title: `Synthetic task ${index}`,
          },
        });
      }
      // Soft-deleted records must not contribute to the active volume.
      await database.company.create({
        data: {
          organizationId,
          legalName: `Soft-deleted ${tenant.organizationSlug}`,
          createdBy: actor,
          updatedBy: actor,
          deletedAt: new Date(),
          deletedBy: actor,
        },
      });
    });
  }

  async function readVolume(token: string) {
    return request(app.getHttpServer())
      .get("/api/v1/dashboards/volume")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  }

  it("isolates dashboard metrics across three real tenants", async () => {
    const role = await restricted.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual([{ rolsuper: false, rolbypassrls: false }]);

    const first = await createTenant(1);
    const second = await createTenant(2);
    const third = await createTenant(3);

    await seed(first, {
      companies: 1,
      contacts: 1,
      opportunities: 0,
      activities: 0,
    });
    await seed(second, {
      companies: 2,
      contacts: 1,
      opportunities: 1,
      activities: 0,
    });
    await seed(third, {
      companies: 3,
      contacts: 2,
      opportunities: 1,
      activities: 2,
    });

    const expected = [
      { companies: 1, contacts: 1, opportunities: 0, activities: 0 },
      { companies: 2, contacts: 1, opportunities: 1, activities: 0 },
      { companies: 3, contacts: 2, opportunities: 1, activities: 2 },
    ];

    for (const [index, tenant] of [first, second, third].entries()) {
      const response = await readVolume(tenant.token);
      expect(response.body.counts).toEqual(expected[index]);
      expect(response.body.totalActiveRecords).toBe(
        Object.values(expected[index]).reduce((sum, value) => sum + value, 0)
      );
      expect(response.body).not.toHaveProperty("organizationId");
      expect(response.body).not.toHaveProperty("items");

      const catalog = await request(app.getHttpServer())
        .get("/api/v1/dashboards/catalog")
        .set("Authorization", `Bearer ${tenant.token}`)
        .expect(200);
      expect(catalog.body.metrics).toHaveLength(4);
    }

    // Repeat after switching sessions: a previous tenant must not be cached.
    expect((await readVolume(first.token)).body.counts).toEqual(expected[0]);

    for (const outsider of [second, third]) {
      const escaped = await restricted.withTenant(
        outsider.organizationId,
        database =>
          database.company.count({
            where: { organizationId: first.organizationId, deletedAt: null },
          })
      );
      expect(escaped).toBe(0);
    }

    await restricted.withTenant(first.organizationId, async database => {
      expect(
        await database.company.count({
          where: { organizationId: first.organizationId, deletedAt: null },
        })
      ).toBe(1);
    });

    await expect(
      restricted.company.count({
        where: { organizationId: first.organizationId },
      })
    ).resolves.toBe(0);

    await request(app.getHttpServer())
      .get(`/api/v1/dashboards/volume?organizationId=${third.organizationId}`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/dashboards/catalog?tenantId=${third.organizationId}`)
      .set("Authorization", `Bearer ${second.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/v1/dashboards/volume")
      .expect(401);

    // Even a valid administrative session is rejected when elevated globally.
    await admin.organizationMembership.update({
      where: { id: third.membershipId },
      data: { isSuperuser: true },
    });
    await request(app.getHttpServer())
      .get("/api/v1/dashboards/volume")
      .set("Authorization", `Bearer ${third.token}`)
      .expect(403);
  });
});

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

describe("C4.1.1 management summary API", () => {
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

  async function createAdminFixture() {
    const organization = await prisma.organization.create({
      data: {
        name: "Management Summary Organization",
        slug: "management-summary-org",
      },
    });
    const password = "Strong-Management-Summary-Password-2026!";
    const user = await prisma.user.create({
      data: {
        email: "management-summary-admin@example.test",
        emailNormalized: "management-summary-admin@example.test",
        displayName: "Management Summary Admin",
        passwordHash: await passwords.hash(password),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: user.email,
        password,
        organizationSlug: organization.slug,
      })
      .expect(200);

    return {
      organization,
      token: response.body.accessToken as string,
    };
  }

  it("returns the management summary for an authenticated administrator", async () => {
    const fixture = await createAdminFixture();

    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/management-summary")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      opportunitiesByStage: [],
      openEstimatedValue: "0.00",
      pendingActivities: 0,
      overdueActivities: 0,
      undatedActivities: 0,
    });
    expect(response.body.asOf).toEqual(expect.any(String));
  });
});

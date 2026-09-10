import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";

const DEFAULT_STAGES = [
  { name: "Prospecção", position: 1, kind: "OPEN" },
  { name: "Qualificação", position: 2, kind: "OPEN" },
  { name: "Proposta", position: 3, kind: "OPEN" },
  { name: "Negociação", position: 4, kind: "OPEN" },
  { name: "Ganha", position: 5, kind: "WON" },
  { name: "Perdida", position: 6, kind: "LOST" },
] as const;

describe("C3.4 sales pipeline API", () => {
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

  it("bootstraps exactly one six-stage default pipeline per organization", async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Pipeline Organization A", slug: "pipeline-org-a" },
      }),
      prisma.organization.create({
        data: { name: "Pipeline Organization B", slug: "pipeline-org-b" },
      }),
    ]);
    const password = "Strong-Pipeline-Password-2026!";
    const user = await createUser({
      email: "pipeline-admin@example.test",
      password,
      displayName: "Pipeline Admin",
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organizationA.id,
          userId: user.id,
          role: "ADMIN",
        },
        {
          organizationId: organizationB.id,
          userId: user.id,
          role: "MANAGER",
        },
      ],
    });

    const tokenA = await login({
      email: user.email,
      password,
      organizationSlug: organizationA.slug,
    });
    const tokenB = await login({
      email: user.email,
      password,
      organizationSlug: organizationB.slug,
    });

    const firstA = await request(app.getHttpServer())
      .post("/api/v1/pipelines/default")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-request-id", "c3-4-pipeline-bootstrap-a")
      .expect(200);

    expect(firstA.body).toMatchObject({
      name: "Funil de Vendas",
      isActive: true,
      stages: DEFAULT_STAGES,
    });
    expect(firstA.body.stages).toHaveLength(6);

    const secondA = await request(app.getHttpServer())
      .post("/api/v1/pipelines/default")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(secondA.body.id).toBe(firstA.body.id);

    const auditA = await prisma.auditLog.findMany({
      where: {
        organizationId: organizationA.id,
        action: "pipeline.default_created",
        entityType: "pipeline",
        entityId: firstA.body.id,
      },
    });
    expect(auditA).toHaveLength(1);
    expect(auditA[0]?.requestId).toBe("c3-4-pipeline-bootstrap-a");

    const createdB = await request(app.getHttpServer())
      .post("/api/v1/pipelines/default")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);

    expect(createdB.body.id).not.toBe(firstA.body.id);
    expect(createdB.body.stages).toMatchObject(DEFAULT_STAGES);

    const listA = await request(app.getHttpServer())
      .get("/api/v1/pipelines")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(listA.body).toHaveLength(1);
    expect(listA.body[0].id).toBe(firstA.body.id);
    expect(listA.body[0].stages).toMatchObject(DEFAULT_STAGES);

    const listB = await request(app.getHttpServer())
      .get("/api/v1/pipelines")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);

    expect(listB.body).toHaveLength(1);
    expect(listB.body[0].id).toBe(createdB.body.id);
  });

  it("does not allow seller or viewer memberships to bootstrap pipeline configuration", async () => {
    const organization = await prisma.organization.create({
      data: { name: "Pipeline Restricted", slug: "pipeline-restricted" },
    });
    const password = "Strong-Pipeline-Restricted-2026!";
    const seller = await createUser({
      email: "pipeline-seller@example.test",
      password,
      displayName: "Pipeline Seller",
    });
    const viewer = await createUser({
      email: "pipeline-viewer@example.test",
      password,
      displayName: "Pipeline Viewer",
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organization.id,
          userId: seller.id,
          role: "SELLER",
        },
        {
          organizationId: organization.id,
          userId: viewer.id,
          role: "VIEWER",
        },
      ],
    });

    for (const user of [seller, viewer]) {
      const token = await login({
        email: user.email,
        password,
        organizationSlug: organization.slug,
      });

      await request(app.getHttpServer())
        .post("/api/v1/pipelines/default")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get("/api/v1/pipelines")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    }
  });
});

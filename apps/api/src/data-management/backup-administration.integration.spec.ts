import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { PrismaService } from "../database/prisma.service";

describe("backup administration HTTP authorization", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("never permits an ordinary ADMIN to access or mutate backups", async () => {
    const suffix = randomUUID();
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        organizationName: `Org ${suffix}`,
        adminDisplayName: "Admin",
        adminEmail: `backup-admin-${suffix}@example.test`,
        adminPassword: "synthetic-test-password-123!",
      })
      .expect(201);

    const token = registered.body.accessToken as string;
    const server = request(app.getHttpServer());

    await server
      .get("/api/v1/admin/backups")
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .get("/api/v1/admin/backups/operations")
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .get("/api/v1/admin/backups/schedule")
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .get("/api/v1/admin/storage/allocation")
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .put("/api/v1/admin/storage/allocation")
      .auth(token, { type: "bearer" })
      .send({ allocatedGiB: 5, confirmation: "AJUSTAR COTA" })
      .expect(403);
    await server
      .get("/api/v1/admin/purge/policy")
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .put("/api/v1/admin/purge/policy")
      .auth(token, { type: "bearer" })
      .send({
        enabled: true,
        retentionDays: 90,
        confirmation: "ATIVAR EXPURGO",
      })
      .expect(403);
    await server
      .post("/api/v1/admin/backups")
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .put("/api/v1/admin/backups/schedule")
      .auth(token, { type: "bearer" })
      .send({ enabled: false })
      .expect(403);
    await server
      .post(`/api/v1/admin/backups/${randomUUID()}/preview`)
      .auth(token, { type: "bearer" })
      .expect(403);
    await server
      .get(`/api/v1/admin/backups/${randomUUID()}/download`)
      .auth(token, { type: "bearer" })
      .expect(403);
  });

  it("shows a tenant-scoped catalog and schedule to a protected superuser", async () => {
    const suffix = randomUUID();
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        organizationName: `Protected ${suffix}`,
        adminDisplayName: "Superuser",
        adminEmail: `backup-super-${suffix}@example.test`,
        adminPassword: "synthetic-test-password-123!",
      })
      .expect(201);

    const token = registered.body.accessToken as string;
    const organizationId = registered.body.organization.id as string;
    const userId = registered.body.user.id as string;
    const owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    try {
      await owner.organizationMembership.update({
        where: {
          organizationId_userId: { organizationId, userId },
        },
        data: { isSuperuser: true },
      });
    } finally {
      await owner.onModuleDestroy();
    }

    const server = request(app.getHttpServer());
    const catalog = await server
      .get("/api/v1/admin/backups")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(catalog.body.backups).toEqual([]);

    const operations = await server
      .get("/api/v1/admin/backups/operations")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(operations.body).toEqual([]);

    const schedule = await server
      .get("/api/v1/admin/backups/schedule")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(schedule.body.enabled).toBe(false);

    const updated = await server
      .put("/api/v1/admin/backups/schedule")
      .auth(token, { type: "bearer" })
      .send({
        enabled: false,
        frequency: "DAILY",
        localTime: "02:00",
        weekday: 0,
        intervalMinutes: null,
        retentionCount: 15,
        timezone: "America/Sao_Paulo",
      })
      .expect(200);
    expect(updated.body.enabled).toBe(false);
    const allocation = await server
      .get("/api/v1/admin/storage/allocation")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(allocation.body).toMatchObject({
      allocatedGiB: null,
      usedBytes: "0",
      alertLevel: "UNALLOCATED",
      enforced: false,
    });
    await server
      .put("/api/v1/admin/storage/allocation")
      .auth(token, { type: "bearer" })
      .send({ allocatedGiB: 5 })
      .expect(400);
    const savedAllocation = await server
      .put("/api/v1/admin/storage/allocation")
      .auth(token, { type: "bearer" })
      .send({ allocatedGiB: 5, confirmation: "AJUSTAR COTA" })
      .expect(200);
    expect(savedAllocation.body.allocatedGiB).toBe(5);
    const policy = await server
      .get("/api/v1/admin/purge/policy")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(policy.body).toMatchObject({
      enabled: false,
      retentionDays: 180,
      target: "EXPIRED_OPERATION_PREVIEWS",
    });
    await server
      .put("/api/v1/admin/purge/policy")
      .auth(token, { type: "bearer" })
      .send({ enabled: true, retentionDays: 90 })
      .expect(400);
    const savedPurge = await server
      .put("/api/v1/admin/purge/policy")
      .auth(token, { type: "bearer" })
      .send({
        enabled: true,
        retentionDays: 90,
        confirmation: "ATIVAR EXPURGO",
      })
      .expect(200);
    expect(savedPurge.body).toMatchObject({
      enabled: true,
      retentionDays: 90,
      target: "EXPIRED_OPERATION_PREVIEWS",
    });
  });

  it("rejects unauthenticated catalog, schedule and download", async () => {
    const server = request(app.getHttpServer());
    await server.get("/api/v1/admin/backups").expect(401);
    await server.get("/api/v1/admin/backups/schedule").expect(401);
    await server.get("/api/v1/admin/purge/policy").expect(401);
    await server.get("/api/v1/admin/storage/allocation").expect(401);
    await server
      .get(`/api/v1/admin/backups/${randomUUID()}/download`)
      .expect(401);
  });
});

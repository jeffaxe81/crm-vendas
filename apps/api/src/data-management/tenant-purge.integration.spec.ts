import { randomUUID } from "node:crypto";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { TenantPurgeService } from "./tenant-purge.service";

describe("tenant-specific purge policy and isolated execution", () => {
  let owner: PrismaService;
  let restricted: PrismaService;
  let service: TenantPurgeService;
  let orgA: string;
  let orgB: string;
  let userId: string;
  let sessionA: string;
  let sessionB: string;
  const now = new Date("2026-10-17T12:00:00.000Z");

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);
    service = new TenantPurgeService(restricted);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const user = await owner.user.create({
      data: {
        email: "purge-owner@example.test",
        emailNormalized: "purge-owner@example.test",
        displayName: "Policy Owner",
        passwordHash: "synthetic",
      },
    });
    userId = user.id;
    const a = await owner.organization.create({
      data: { name: "Purge A", slug: "purge-a" },
    });
    const b = await owner.organization.create({
      data: { name: "Purge B", slug: "purge-b" },
    });
    orgA = a.id;
    orgB = b.id;
    sessionA = (
      await owner.refreshSession.create({
        data: {
          organizationId: orgA,
          userId,
          tokenHash: randomUUID(),
          expiresAt: new Date("2027-10-17T12:00:00.000Z"),
        },
      })
    ).id;
    sessionB = (
      await owner.refreshSession.create({
        data: {
          organizationId: orgB,
          userId,
          tokenHash: randomUUID(),
          expiresAt: new Date("2027-10-17T12:00:00.000Z"),
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await restricted?.onModuleDestroy();
  });

  const principal = (organizationId: string) =>
    ({
      organizationId,
      userId,
      authMethod: "session",
      isSuperuser: true,
    }) as AuthenticatedPrincipal;

  async function makePreview(
    organizationId: string,
    sessionId: string,
    daysOld: number
  ) {
    const createdAt = new Date(now.getTime() - daysOld * 86400000);
    const expiresAt = new Date(createdAt.getTime() + 300000);
    return owner.operationPreview.create({
      data: {
        organizationId,
        actorUserId: userId,
        sessionId,
        kind: "DELETE",
        currentFingerprint: "a".repeat(64),
        createdAt,
        expiresAt,
        payload: {},
      },
    });
  }

  it("defaults to disabled and requires explicit confirmation only to enable", async () => {
    const initial = await service.read(principal(orgA));
    expect(initial).toMatchObject({
      enabled: false,
      retentionDays: 180,
      target: "EXPIRED_OPERATION_PREVIEWS",
      estimatedRecords: 0,
    });
    await expect(
      service.configure(
        principal(orgA),
        { enabled: true, retentionDays: 90 },
        randomUUID()
      )
    ).rejects.toThrow();
    await expect(
      service.configure(
        principal(orgA),
        { enabled: true, retentionDays: 29, confirmation: "ATIVAR EXPURGO" },
        randomUUID()
      )
    ).rejects.toThrow();
    await service.configure(
      principal(orgA),
      { enabled: true, retentionDays: 90, confirmation: "ATIVAR EXPURGO" },
      randomUUID()
    );
    expect((await service.read(principal(orgA))).enabled).toBe(true);
    expect((await service.read(principal(orgB))).enabled).toBe(false);
    expect(
      await restricted.withTenant(orgB, tx =>
        tx.purgePolicy.findMany({ where: { organizationId: orgA } })
      )
    ).toEqual([]);
  });

  it("deletes only old expired previews in the enabled tenant and audits", async () => {
    const oldA = await makePreview(orgA, sessionA, 120);
    const recentA = await makePreview(orgA, sessionA, 15);
    const oldB = await makePreview(orgB, sessionB, 120);
    await service.configure(
      principal(orgA),
      { enabled: true, retentionDays: 90, confirmation: "ATIVAR EXPURGO" },
      randomUUID()
    );
    const read = await service.read(principal(orgA));
    expect(read.estimatedRecords).toBe(1);
    expect(await service.runDue(now)).toBe(1);
    expect(
      await restricted.withTenant(orgA, tx =>
        tx.operationPreview.findUnique({ where: { id: oldA.id } })
      )
    ).toBeNull();
    expect(
      await restricted.withTenant(orgA, tx =>
        tx.operationPreview.findUnique({ where: { id: recentA.id } })
      )
    ).not.toBeNull();
    expect(
      await restricted.withTenant(orgB, tx =>
        tx.operationPreview.findUnique({ where: { id: oldB.id } })
      )
    ).not.toBeNull();
    const audit = await restricted.withTenant(orgA, tx =>
      tx.auditLog.findFirst({
        where: { action: "purge.expired_previews_completed" },
      })
    );
    expect(audit?.metadata).toMatchObject({ recordsDeleted: 1 });
    expect(await service.runDue(now)).toBe(0);
  });

  it("leaves previews untouched when policy is disabled", async () => {
    const old = await makePreview(orgA, sessionA, 300);
    await service.configure(
      principal(orgA),
      { enabled: false, retentionDays: 30 },
      randomUUID()
    );
    expect(await service.runDue(now)).toBe(0);
    expect(
      await restricted.withTenant(orgA, tx =>
        tx.operationPreview.findUnique({ where: { id: old.id } })
      )
    ).not.toBeNull();
  });
});

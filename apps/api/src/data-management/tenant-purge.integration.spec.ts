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
  async function makeDelivery(
    organizationId: string,
    status = "EXHAUSTED",
    daysOld = 120
  ) {
    const date = new Date(now.getTime() - daysOld * 86400000);
    const subscription = await owner.webhookSubscription.create({
      data: {
        organizationId,
        createdBy: userId,
        name: "Synthetic purge",
        targetUrl: "https://synthetic.invalid/hook",
        encryptedSecret: "synthetic-secret",
        eventTypes: ["company.created"],
      },
    });
    const dispatch = await owner.webhookDispatch.create({
      data: {
        organizationId,
        subscriptionId: subscription.id,
        subscriptionVersion: 1,
        eventId: randomUUID(),
        eventType: "company.created",
        payload: { synthetic: true },
        targetUrl: "https://synthetic.invalid/hook",
        encryptedSecret: "synthetic-secret",
        status,
        requestId: randomUUID(),
        createdAt: date,
        updatedAt: date,
        nextAttemptAt: null,
      },
    });
    return owner.webhookDelivery.create({
      data: {
        organizationId,
        subscriptionId: subscription.id,
        dispatchId: dispatch.id,
        attempt: 1,
        status: "FAILED",
        errorCode: "SYNTHETIC",
        createdAt: date,
      },
    });
  }

  it("simulates exact proposed categories without policy, audit or data mutation", async () => {
    const preview = await makePreview(orgA, sessionA, 120);
    await makePreview(orgB, sessionB, 120);
    await makeDelivery(orgA);
    await makeDelivery(orgA, "PENDING");
    await makeDelivery(orgA, "EXHAUSTED", 5);
    const before = {
      policies: await owner.purgePolicy.count(),
      audit: await owner.auditLog.count(),
      deliveries: await owner.webhookDelivery.count(),
    };
    const result = await service.simulate(principal(orgA), {
      retentionDays: 90,
      categories: ["EXPIRED_OPERATION_PREVIEWS", "TERMINAL_WEBHOOK_DELIVERIES"],
    });
    expect(result).toMatchObject({
      dryRun: true,
      estimatedRecords: 2,
      counts: { EXPIRED_OPERATION_PREVIEWS: 1, TERMINAL_WEBHOOK_DELIVERIES: 1 },
    });
    expect({
      policies: await owner.purgePolicy.count(),
      audit: await owner.auditLog.count(),
      deliveries: await owner.webhookDelivery.count(),
    }).toEqual(before);
    expect(
      await owner.operationPreview.findUnique({ where: { id: preview.id } })
    ).not.toBeNull();
    await expect(
      service.simulate(principal(orgA), {
        retentionDays: 90,
        categories: ["USERS"],
      })
    ).rejects.toThrow();
    await expect(
      service.simulate(principal(orgA), { retentionDays: 90, categories: [] })
    ).rejects.toThrow();
  });

  it("requires category opt-in and keeps active webhook attempts and referenced previews", async () => {
    const old = await makeDelivery(orgA);
    const active = await makeDelivery(orgA, "PROCESSING");
    const other = await makeDelivery(orgB);
    const referenced = await makePreview(orgA, sessionA, 120);
    await owner.dataOperation.create({
      data: {
        organizationId: orgA,
        kind: "RESTORE",
        payload: { previewId: referenced.id },
      },
    });
    await service.configure(
      principal(orgA),
      { enabled: true, retentionDays: 90, confirmation: "ATIVAR EXPURGO" },
      randomUUID()
    );
    expect((await service.read(principal(orgA))).categories).toEqual([
      "EXPIRED_OPERATION_PREVIEWS",
    ]);
    expect(await service.runDue(now)).toBe(0);
    expect(
      await owner.webhookDelivery.findUnique({ where: { id: old.id } })
    ).not.toBeNull();
    await service.configure(
      principal(orgA),
      {
        enabled: true,
        retentionDays: 90,
        categories: ["TERMINAL_WEBHOOK_DELIVERIES"],
        confirmation: "ATIVAR EXPURGO",
      },
      randomUUID()
    );
    const next = new Date(now.getTime() + 86400000);
    const results = await Promise.all([
      service.runDue(next),
      service.runDue(next),
    ]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(
      await owner.webhookDelivery.findUnique({ where: { id: old.id } })
    ).toBeNull();
    for (const id of [active.id, other.id])
      expect(
        await owner.webhookDelivery.findUnique({ where: { id } })
      ).not.toBeNull();
    expect(
      await owner.operationPreview.findUnique({ where: { id: referenced.id } })
    ).not.toBeNull();
    expect(
      await owner.user.findUnique({ where: { id: userId } })
    ).not.toBeNull();
    const audit = await owner.auditLog.findFirst({
      where: {
        action: "purge.expired_previews_completed",
        organizationId: orgA,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.metadata).toMatchObject({
      counts: { TERMINAL_WEBHOOK_DELIVERIES: 1 },
    });
    expect(JSON.stringify(audit?.metadata)).not.toMatch(
      /synthetic-secret|synthetic.invalid|payload/
    );
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDelivery.deleteMany({ where: { id: active.id } })
      )
    ).rejects.toThrow();
  });

  it("limits each category to 500 records and rolls deletion back when mandatory audit fails", async () => {
    const preview = await makePreview(orgA, sessionA, 120);
    await service.configure(
      principal(orgA),
      { enabled: true, retentionDays: 90, confirmation: "ATIVAR EXPURGO" },
      randomUUID()
    );
    await owner.$executeRawUnsafe(
      `CREATE FUNCTION public.test_reject_purge_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'purge.expired_previews_completed' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`
    );
    await owner.$executeRawUnsafe(
      "CREATE TRIGGER test_reject_purge_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test_reject_purge_audit()"
    );
    try {
      await expect(service.runDue(now)).rejects.toThrow();
      expect(
        await owner.operationPreview.findUnique({ where: { id: preview.id } })
      ).not.toBeNull();
      expect((await service.read(principal(orgA))).lastRunAt).toBeNull();
    } finally {
      await owner.$executeRawUnsafe(
        "DROP TRIGGER test_reject_purge_audit ON public.audit_logs"
      );
      await owner.$executeRawUnsafe(
        "DROP FUNCTION public.test_reject_purge_audit()"
      );
    }
    const { id, ...data } = preview;
    await owner.operationPreview.createMany({
      data: Array.from({ length: 501 }, () => ({
        ...data,
        payload: {},
        id: randomUUID(),
      })),
    });
    expect(await service.runDue(now)).toBe(500);
    expect(
      await owner.operationPreview.count({ where: { organizationId: orgA } })
    ).toBe(2);
    expect(await service.runDue(now)).toBe(0);
  });
});

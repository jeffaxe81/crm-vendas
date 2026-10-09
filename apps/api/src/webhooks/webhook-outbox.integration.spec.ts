import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CompaniesService } from "../companies/companies.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { TicketsService } from "../tickets/tickets.service";
import { TicketSatisfactionService } from "../tickets/ticket-satisfaction.service";
import { enqueueWebhookEvent } from "./webhook-outbox";
import { WebhookWorker } from "./webhook-worker";
import { WebhooksService } from "./webhooks.service";
import { encryptWebhookSecret } from "./webhook-secret";
import type { WebhookTransport } from "./webhook-transport";

// Real PostgreSQL tests: CI must supply a NOSUPERUSER/NOBYPASSRLS role.
describe("webhook transactional outbox and adversarial PostgreSQL leases", () => {
  let owner: PrismaService, app: PrismaService, contender: PrismaService;
  let org: string, foreignOrg: string, user: string, subscriptionId: string;
  const key = Buffer.alloc(32, 9).toString("base64");
  const previousKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  const now = new Date("2026-10-09T00:00:00Z");
  const eventTypes = [
    "company.created",
    "opportunity.won",
    "opportunity.lost",
    "ticket.closed",
  ];
  const context = () => ({
    organizationId: org,
    actorUserId: user,
    requestId: "outbox-integration",
  });
  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    contender = new PrismaService(process.env.RLS_DATABASE_URL);
    const [role] = await app.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });
  beforeEach(async () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = key;
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    user = (
      await owner.user.create({
        data: {
          email: "outbox@example.test",
          emailNormalized: "outbox@example.test",
          displayName: "Outbox",
          passwordHash: "synthetic",
        },
      })
    ).id;
    org = (
      await owner.organization.create({
        data: { name: "Outbox", slug: "outbox" },
      })
    ).id;
    foreignOrg = (
      await owner.organization.create({
        data: { name: "Foreign", slug: "foreign" },
      })
    ).id;
    await app.withTenant(org, tx =>
      tx.organizationMembership.create({
        data: { organizationId: org, userId: user, role: "ADMIN" },
      })
    );
    subscriptionId = randomUUID();
    await app.withTenant(org, tx =>
      tx.webhookSubscription.create({
        data: {
          id: subscriptionId,
          organizationId: org,
          name: "ERP",
          targetUrl: "https://example.com/events",
          eventTypes,
          encryptedSecret: encryptWebhookSecret(
            "secret",
            key,
            `${org}:${subscriptionId}`
          ),
          createdBy: user,
        },
      })
    );
  });
  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await app?.onModuleDestroy();
    await contender?.onModuleDestroy();
    if (previousKey === undefined) delete process.env.WEBHOOK_ENCRYPTION_KEY;
    else process.env.WEBHOOK_ENCRYPTION_KEY = previousKey;
  });
  async function queued() {
    await app.withTenant(org, tx =>
      enqueueWebhookEvent(tx, {
        organizationId: org,
        eventType: "company.created",
        entityId: randomUUID(),
        entityVersion: 1,
        requestId: "lease-request",
        occurredAt: now,
      })
    );
    return app.withTenant(org, tx => tx.webhookDispatch.findFirstOrThrow());
  }
  async function stored(id: string) {
    return app.withTenant(org, tx =>
      tx.webhookDispatch.findFirstOrThrow({
        where: { id },
        include: { deliveries: { orderBy: { attempt: "asc" } } },
      })
    );
  }
  it("rolls back data and dispatches together after enqueue or a failed outbox write", async () => {
    const companyId = randomUUID();
    await expect(
      app.withTenant(org, async tx => {
        const company = await tx.company.create({
          data: {
            id: companyId,
            organizationId: org,
            legalName: "Sensitive",
            createdBy: user,
            updatedBy: user,
          },
        });
        await enqueueWebhookEvent(tx, {
          organizationId: org,
          eventType: "company.created",
          entityId: company.id,
          entityVersion: 1,
          requestId: "rollback",
        });
        expect(await tx.webhookDispatch.count()).toBe(1);
        throw Error("business failure after enqueue");
      })
    ).rejects.toThrow("business failure after enqueue");
    expect(await app.withTenant(org, tx => tx.company.count())).toBe(0);
    expect(await app.withTenant(org, tx => tx.webhookDispatch.count())).toBe(0);
    const companies = new CompaniesService(app, new AuditService(app));
    await expect(
      companies.create(
        { legalName: "Must roll back" },
        { ...context(), requestId: "x".repeat(161) }
      )
    ).rejects.toThrow();
    expect(await app.withTenant(org, tx => tx.company.count())).toBe(0);
    expect(await app.withTenant(org, tx => tx.webhookDispatch.count())).toBe(0);
  });
  it("persists all four minimal domain triggers and emits once for competing moves", async () => {
    const audit = new AuditService(app);
    const company = await new CompaniesService(app, audit).create(
      { legalName: "Private company", notes: "Never publish" },
      context()
    );
    const pipeline = await app.withTenant(org, tx =>
      tx.pipeline.create({
        data: { organizationId: org, name: "Sales", normalizedName: "sales" },
      })
    );
    const stages = await app.withTenant(org, async tx =>
      Promise.all(
        (["OPEN", "WON", "LOST"] as const).map((kind, position) =>
          tx.pipelineStage.create({
            data: {
              organizationId: org,
              pipelineId: pipeline.id,
              name: kind,
              kind,
              position,
            },
          })
        )
      )
    );
    const opportunities = new OpportunitiesService(app, audit);
    const input = {
      pipelineId: pipeline.id,
      companyId: company.id,
      ownerUserId: user,
      title: "Private opportunity",
      estimatedValue: "42.00",
    };
    await opportunities.create({ ...input, stageId: stages[1]!.id }, context());
    await opportunities.create({ ...input, stageId: stages[2]!.id }, context());
    const open = await opportunities.create(
      { ...input, stageId: stages[0]!.id },
      context()
    );
    const moves = await Promise.allSettled([
      opportunities.move(
        open.id,
        { version: 1, stageId: stages[1]!.id },
        context()
      ),
      opportunities.move(
        open.id,
        { version: 1, stageId: stages[2]!.id },
        context()
      ),
    ]);
    expect(moves.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(moves.filter(r => r.status === "rejected")).toHaveLength(1);
    const failure = moves.find(r => r.status === "rejected");
    expect(
      failure?.status === "rejected" ? failure.reason : null
    ).toBeInstanceOf(ConflictException);
    const ticket = await app.withTenant(org, tx =>
      tx.ticket.create({
        data: {
          organizationId: org,
          protocol: "AX-2026-000001",
          subject: "Private ticket",
          status: "RESOLVED",
          priority: "MEDIUM",
          channel: "EMAIL",
          openedAt: now,
          resolvedAt: now,
          createdBy: user,
          updatedBy: user,
        },
      })
    );
    const tickets = new TicketsService(
      app,
      audit,
      () => now,
      new TicketSatisfactionService(app, audit)
    );
    await tickets.changeStatus(
      ticket.id,
      { version: 1, status: "CLOSED" },
      context(),
      now
    );
    await expect(
      tickets.changeStatus(
        ticket.id,
        { version: 1, status: "CLOSED" },
        context(),
        now
      )
    ).rejects.toThrow();
    const rows = await app.withTenant(org, tx => tx.webhookDispatch.findMany());
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map(row => row.eventType))).toEqual(
      new Set(eventTypes)
    );
    for (const row of rows) {
      const payload = row.payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        "data",
        "id",
        "occurredAt",
        "organizationId",
        "type",
        "version",
      ]);
      expect(payload.id).toBe(row.eventId);
      expect(Object.keys(payload.data as object).sort()).toEqual([
        "entityId",
        "version",
      ]);
    }
    expect(JSON.stringify(rows.map(row => row.payload))).not.toMatch(
      /Private|Never publish|42\.00/
    );
    expect(
      await app.withTenant(foreignOrg, tx => tx.webhookDispatch.findMany())
    ).toEqual([]);
  });
  it("skips a dispatch locked by a competing claim transaction", async () => {
    const dispatch = await queued();
    let release!: () => void, locked!: () => void;
    const unlock = new Promise<void>(r => (release = r)),
      acquired = new Promise<void>(r => (locked = r));
    const locking = app.withTenant(org, async tx => {
      await tx.$queryRaw`SELECT id FROM webhook_dispatches WHERE id=${dispatch.id}::uuid FOR UPDATE`;
      locked();
      await unlock;
    });
    await acquired;
    let sends = 0;
    const work = new WebhookWorker(contender, {
      send: async () => {
        sends++;
        return { responseStatus: 200, errorCode: null };
      },
    }).processNext(org, now);
    let timer: NodeJS.Timeout | undefined;
    try {
      expect(
        await Promise.race([
          work,
          new Promise<"blocked">(r => {
            timer = setTimeout(() => r("blocked"), 1000);
          }),
        ])
      ).toBe(false);
      expect(sends).toBe(0);
    } finally {
      if (timer) clearTimeout(timer);
      release();
      await locking;
      await work;
    }
    expect((await stored(dispatch.id)).attemptCount).toBe(0);
  });
  it("allows only one worker to claim while another transport is in flight", async () => {
    const dispatch = await queued();
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(r => (release = r)),
      sending = new Promise<void>(r => (started = r));
    let sends = 0;
    const transport: WebhookTransport = {
      send: async () => {
        sends++;
        started();
        await blocked;
        return { responseStatus: 200, errorCode: null };
      },
    };
    const first = new WebhookWorker(app, transport).processNext(org, now);
    await sending;
    try {
      expect(
        await new WebhookWorker(contender, transport).processNext(org, now)
      ).toBe(false);
      const row = await stored(dispatch.id);
      expect(row.attemptCount).toBe(1);
      expect(row.status).toBe("PROCESSING");
    } finally {
      release();
      await first;
    }
    expect(sends).toBe(1);
    expect((await stored(dispatch.id)).deliveries).toHaveLength(1);
  });
  it("recovers a dead lease, keeps event ID and discards the original worker's late response", async () => {
    const dispatch = await queued();
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(r => (release = r)),
      sending = new Promise<void>(r => (started = r));
    const sentIds: string[] = [];
    const firstTransport: WebhookTransport = {
      send: async (_url, _body, headers) => {
        sentIds.push(headers["X-Axes-Event-Id"]!);
        started();
        await blocked;
        return { responseStatus: 200, errorCode: null };
      },
    };
    const first = new WebhookWorker(app, firstTransport).processNext(org, now);
    await sending;
    try {
      const secondTransport: WebhookTransport = {
        send: async (_url, _body, headers) => {
          sentIds.push(headers["X-Axes-Event-Id"]!);
          return { responseStatus: 200, errorCode: null };
        },
      };
      expect(
        await new WebhookWorker(contender, secondTransport).processNext(
          org,
          new Date(now.getTime() + 31000)
        )
      ).toBe(true);
    } finally {
      release();
      await first;
    }
    const row = await stored(dispatch.id);
    expect(row.attemptCount).toBe(2);
    expect(row.status).toBe("DELIVERED");
    expect(row.deliveries).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "FAILED",
        errorCode: "LEASE_EXPIRED",
      }),
      expect.objectContaining({ attempt: 2, status: "DELIVERED" }),
    ]);
    expect(sentIds).toEqual([dispatch.eventId, dispatch.eventId]);
    expect(
      await new WebhookWorker(contender, firstTransport).processNext(
        org,
        new Date(now.getTime() + 60000)
      )
    ).toBe(false);
  });
  it("appends an abandoned fifth attempt and exhausts exactly once without another send", async () => {
    const dispatch = await queued();
    await app.withTenant(org, tx =>
      tx.webhookDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: "PROCESSING",
          attemptCount: 5,
          leaseToken: randomUUID(),
          lockedUntil: now,
          nextAttemptAt: null,
        },
      })
    );
    let sends = 0;
    const transport: WebhookTransport = {
      send: async () => {
        sends++;
        return { responseStatus: 200, errorCode: null };
      },
    };
    const results = await Promise.all([
      new WebhookWorker(app, transport).processNext(org, now),
      new WebhookWorker(contender, transport).processNext(org, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(sends).toBe(0);
    const row = await stored(dispatch.id);
    expect(row.status).toBe("EXHAUSTED");
    expect(row.deliveries).toEqual([
      expect.objectContaining({ attempt: 5, errorCode: "LEASE_EXPIRED" }),
    ]);
    const audits = await app.withTenant(org, tx =>
      tx.auditLog.findMany({
        where: { action: "integration.webhook.exhausted" },
      })
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: null,
      requestId: "lease-request",
      metadata: {
        actorType: "SYSTEM",
        actorId: "webhook-worker",
        attemptCount: 5,
        errorCode: "LEASE_EXPIRED",
      },
    });
  });
  it("checks management invalidation again between the committed claim and opening a connection", async () => {
    const dispatch = await queued();
    let transactions = 0,
      sends = 0;
    const guarded = {
      withTenant: async <T>(
        organizationId: string,
        fn: Parameters<PrismaService["withTenant"]>[1]
      ) => {
        transactions++;
        if (transactions === 2)
          await new WebhooksService(contender).update(
            subscriptionId,
            { version: 1, isActive: false },
            context()
          );
        return app.withTenant(organizationId, fn) as Promise<T>;
      },
    } as unknown as PrismaService;
    await new WebhookWorker(guarded, {
      send: async () => {
        sends++;
        return { responseStatus: 200, errorCode: null };
      },
    }).processNext(org, now);
    const row = await stored(dispatch.id);
    expect(row.status).toBe("CANCELLED");
    expect(row.deliveries).toEqual([]);
    expect(sends).toBe(0);
  });
  it("retains eligible events and manual tests when another subscribed event is removed", async () => {
    const company = await queued();
    await app.withTenant(org, tx =>
      enqueueWebhookEvent(tx, {
        organizationId: org,
        eventType: "ticket.closed",
        entityId: randomUUID(),
        entityVersion: 1,
        requestId: "event-edit",
        occurredAt: now,
      })
    );
    const management = new WebhooksService(app);
    const manual = await management.test(subscriptionId, context());
    await management.update(
      subscriptionId,
      { version: 1, eventTypes: ["company.created"] },
      context()
    );
    const rows = await app.withTenant(org, tx => tx.webhookDispatch.findMany());
    expect(rows.find(r => r.id === company.id)?.status).toBe("PENDING");
    expect(rows.find(r => r.id === manual.id)?.status).toBe("PENDING");
    expect(rows.find(r => r.eventType === "ticket.closed")?.status).toBe(
      "CANCELLED"
    );
  });
  it("invalidates queued destinations on edit and allows a new manual test only at the new target", async () => {
    const dispatch = await queued();
    const management = new WebhooksService(app);
    await management.update(
      subscriptionId,
      { version: 1, targetUrl: "https://example.net/events" },
      context()
    );
    const row = await stored(dispatch.id);
    expect(row.status).toBe("CANCELLED");
    expect(row.deliveries).toEqual([]);
    const targets: string[] = [];
    const transport: WebhookTransport = {
      send: async url => {
        targets.push(url);
        return { responseStatus: 200, errorCode: null };
      },
    };
    const worker = new WebhookWorker(app, transport);
    expect(await worker.processNext(org, now)).toBe(false);
    const test = await management.test(subscriptionId, context());
    expect(test.eventType).toBe("webhook.test");
    await worker.processNext(org, new Date(Date.now() + 1000));
    expect(targets).toEqual(["https://example.net/events"]);
    expect(await management.history(subscriptionId, org)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: test.id, status: "DELIVERED" }),
        expect.objectContaining({ id: dispatch.id, status: "CANCELLED" }),
      ])
    );
  });
});

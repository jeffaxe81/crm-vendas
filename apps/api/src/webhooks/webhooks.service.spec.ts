import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import type { PrismaService } from "../database/prisma.service";
const org = "e36c3a10-5ba8-4eab-8ee1-26561bf67721";
const id = "c85d9a6b-1b11-4dea-9be4-b9f8b07434b5";
const context = {
  organizationId: org,
  actorUserId: id,
  requestId: "request",
  actorRole: "ADMIN" as const,
};
const input = {
  name: "ERP",
  targetUrl: "https://example.com/events",
  eventTypes: ["company.created" as const],
};
function fixture() {
  const row = {
    id,
    organizationId: org,
    ...input,
    encryptedSecret: "ciphertext",
    isActive: true,
    version: 1,
    createdBy: id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const calls = {
    tenants: [] as string[],
    created: [] as any[],
    updated: [] as any[],
    history: [] as any[],
    audited: [] as any[],
    cancelled: [] as any[],
    dispatches: [] as any[],
  };
  const state = { count: 1, found: row as typeof row | null };
  const tenant = {
    $executeRaw: async () => 1,
    webhookSubscription: {
      findMany: async () => [row],
      create: async ({ data }: any) => {
        calls.created.push(data);
        return { ...row, ...data };
      },
      findFirst: async () => state.found,
      updateMany: async (args: any) => {
        calls.updated.push(args);
        return { count: state.count };
      },
    },
    webhookDispatch: {
      updateMany: async (args: any) => {
        calls.cancelled.push(args);
        return { count: 1 };
      },
      create: async ({ data }: any) => {
        calls.dispatches.push(data);
        return {
          ...data,
          id,
          status: "PENDING",
          attemptCount: 0,
          lastErrorCode: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deliveries: [],
        };
      },
      findMany: async (args: any) => {
        calls.history.push(args);
        return [];
      },
    },
    auditLog: {
      create: async (args: any) => {
        calls.audited.push(args);
        return {};
      },
    },
  };
  const prisma = {
    withTenant: async (organizationId: string, fn: Function) => {
      calls.tenants.push(organizationId);
      return fn(tenant);
    },
  };
  const audit = {
    record: async (args: any) => {
      calls.audited.push(args);
    },
  };
  const service = new WebhooksService(prisma as unknown as PrismaService);
  return { service, calls, state };
}
describe("webhook subscription management", () => {
  const previous = process.env.WEBHOOK_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.WEBHOOK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.WEBHOOK_ENCRYPTION_KEY;
    else process.env.WEBHOOK_ENCRYPTION_KEY = previous;
  });
  it("encrypts a random secret and reveals it once without auditing it", async () => {
    const f = fixture();
    const created = await f.service.create(input, context);
    expect(created?.plainSecret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created).not.toHaveProperty("encryptedSecret");
    expect(f.calls.created[0].encryptedSecret).not.toContain(
      created.plainSecret
    );
    expect(f.calls.tenants).toContain(org);
    expect(JSON.stringify(f.calls.audited)).not.toContain(created.plainSecret);
    expect(JSON.stringify(f.calls.audited)).not.toContain(
      f.calls.created[0].encryptedSecret
    );
  });
  it("fails closed without a key before touching data", async () => {
    delete process.env.WEBHOOK_ENCRYPTION_KEY;
    const f = fixture();
    expect(f.service).toBeDefined();
    await expect(f.service.create(input, context)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(f.calls.tenants).toHaveLength(0);
  });
  it("projects list and history without secrets", async () => {
    const f = fixture();
    expect(await f.service.list(org)).toEqual([
      expect.objectContaining({ id, version: 1 }),
    ]);
    expect((await f.service.list(org))[0]).not.toHaveProperty(
      "encryptedSecret"
    );
    expect(await f.service.history(id, org)).toEqual([]);
    expect(f.calls.history[0]).toMatchObject({
      where: { subscriptionId: id, organizationId: org },
      take: 50,
    });
  });
  it("rejects a stale optimistic version", async () => {
    const f = fixture();
    f.state.count = 0;
    expect(f.service).toBeDefined();
    await expect(
      f.service.update(id, { version: 1, isActive: false }, context)
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("updates under tenant and version predicates", async () => {
    const f = fixture();
    await f.service.update(id, { version: 1, isActive: false }, context);
    expect(f.calls.updated[0]).toMatchObject({
      where: { id, organizationId: org, version: 1 },
      data: { isActive: false, version: { increment: 1 } },
    });
  });
  it.each(["https://10.0.0.1/hook", "https://[::1]/hook"])(
    "rejects unsafe PATCH %s before persistence",
    async targetUrl => {
      const f = fixture();
      await expect(
        f.service.update(id, { version: 1, targetUrl }, context)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(f.calls.tenants).toEqual([]);
      expect(f.calls.updated).toEqual([]);
    }
  );
  it("accepts a public PATCH target and cancels queued leases in the same tenant transaction", async () => {
    const f = fixture();
    await f.service.update(
      id,
      { version: 1, targetUrl: "https://example.net" },
      context
    );
    expect(f.calls.updated).toHaveLength(1);
    expect(f.calls.cancelled[0]).toEqual(
      expect.objectContaining({
        where: {
          organizationId: org,
          subscriptionId: id,
          status: { in: ["PENDING", "RETRY_SCHEDULED", "PROCESSING"] },
          requestStartedAt: null,
        },
        data: expect.objectContaining({
          status: "CANCELLED",
          leaseToken: null,
        }),
      })
    );
    expect(f.calls.cancelled[1]).toMatchObject({
      where: { requestStartedAt: { not: null } },
      data: { status: "CANCELLED", nextAttemptAt: null },
    });
    expect(f.calls.cancelled[1].data).not.toHaveProperty("leaseToken");
    expect(f.calls.cancelled[1].data).not.toHaveProperty("lockedUntil");
  });
  it("retains still-subscribed events when adding an event", async () => {
    const f = fixture();
    await f.service.update(
      id,
      { version: 1, eventTypes: ["company.created", "ticket.closed"] },
      context
    );
    expect(f.calls.cancelled).toEqual([]);
  });
  it("cancels only removed event types while retaining eligible and manual test dispatches", async () => {
    const f = fixture();
    await f.service.update(
      id,
      { version: 1, eventTypes: ["ticket.closed"] },
      context
    );
    expect(f.calls.cancelled).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: { in: ["company.created"] },
          }),
        }),
      ])
    );
  });
  it("does not cancel pending dispatches on name-only edits", async () => {
    const f = fixture();
    await f.service.update(id, { version: 1, name: "Renamed" }, context);
    expect(f.calls.cancelled).toEqual([]);
  });
  it("enqueues a manual test and exposes only the safe pending dispatch summary", async () => {
    const f = fixture();
    const result = await f.service.test(id, context);
    expect(f.calls.dispatches).toHaveLength(1);
    expect(f.calls.dispatches[0]).toMatchObject({
      subscriptionId: id,
      organizationId: org,
      eventType: "webhook.test",
      requestId: "request",
    });
    expect(result).toMatchObject({
      eventType: "webhook.test",
      status: "PENDING",
      deliveries: [],
    });
    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("encryptedSecret");
    expect(JSON.stringify(f.calls.audited)).not.toContain("ciphertext");
  });
  it("refuses manual tests of missing or inactive subscriptions", async () => {
    const f = fixture();
    f.state.found!.isActive = false;
    await expect(f.service.test(id, context)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(f.calls.dispatches).toEqual([]);
    f.state.found = null;
    await expect(f.service.test(id, context)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
  it("hides missing or foreign IDs for update and history", async () => {
    const f = fixture();
    f.state.found = null;
    expect(f.service).toBeDefined();
    await expect(
      f.service.update(id, { version: 1, isActive: false }, context)
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(f.service.history(id, org)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

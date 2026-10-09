import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { LookupAddress } from "node:dns";
import type { PrismaService } from "../database/prisma.service";
import { WebhookWorker } from "./webhook-worker";
import { encryptWebhookSecret } from "./webhook-secret";
import { verifyWebhookSignature } from "./webhook-security";
import type { WebhookTransport } from "./webhook-transport";
import { HttpsWebhookTransport } from "./webhook-transport";
import { WebhooksService } from "./webhooks.service";
const key = Buffer.alloc(32, 9).toString("base64");
const now = new Date("2026-10-09T00:00:00Z");
function fixture() {
  const subscriptionId = randomUUID();
  const subscription = {
    id: subscriptionId,
    organizationId: "org",
    version: 1,
    isActive: true,
    targetUrl: "https://example.com",
    eventTypes: ["company.created"],
    encryptedSecret: encryptWebhookSecret(
      "secret",
      key,
      `org:${subscriptionId}`
    ),
    name: "ERP",
    createdAt: now,
    updatedAt: now,
  };
  const row = {
    id: "dispatch",
    organizationId: "org",
    subscriptionId: subscription.id,
    subscriptionVersion: 1,
    eventId: randomUUID(),
    eventType: "company.created",
    payload: { id: "stable", type: "company.created", version: 1 },
    targetUrl: subscription.targetUrl,
    encryptedSecret: subscription.encryptedSecret,
    status: "PENDING",
    attemptCount: 0,
    nextAttemptAt: now,
    lockedUntil: null as Date | null,
    leaseToken: null as string | null,
    requestId: "request",
    lastErrorCode: null as string | null,
    requestStartedAt: null as Date | null,
  };
  const deliveries: any[] = [],
    audits: any[] = [],
    sends: any[] = [];
  let transactionDepth = 0;
  let startWriteHook: (() => void) | undefined;
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => {
      const due =
        ["PENDING", "RETRY_SCHEDULED"].includes(row.status) &&
        row.nextAttemptAt &&
        row.nextAttemptAt <= clock;
      const expired =
        (row.status === "PROCESSING" ||
          (row.status === "CANCELLED" && row.requestStartedAt !== null)) &&
        row.lockedUntil &&
        row.lockedUntil <= clock;
      return due || expired ? [{ id: row.id }] : [];
    },
    webhookDispatch: {
      findFirst: async ({ where }: any) =>
        (where.leaseToken && row.leaseToken !== where.leaseToken) ||
        (where.status && row.status !== where.status)
          ? null
          : { ...row },
      findFirstOrThrow: async () => ({ ...row }),
      update: async ({ data }: any) => {
        if (data.requestStartedAt) startWriteHook?.();
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        if (data.requestStartedAt) startWriteHook?.();
        if (
          (where.leaseToken && where.leaseToken !== row.leaseToken) ||
          (where.status &&
            typeof where.status === "string" &&
            where.status !== row.status) ||
          (where.status?.in && !where.status.in.includes(row.status)) ||
          (where.requestStartedAt === null && row.requestStartedAt !== null) ||
          (where.requestStartedAt?.not === null &&
            row.requestStartedAt === null)
        )
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    webhookSubscription: {
      findFirst: async () => ({ ...subscription }),
      updateMany: async ({ data }: any) => {
        const { version, ...changes } = data;
        Object.assign(subscription, changes);
        subscription.version += version.increment;
        return { count: 1 };
      },
    },
    webhookDelivery: {
      create: async ({ data }: any) => {
        if (deliveries.some(d => d.attempt === data.attempt))
          throw Error("duplicate attempt");
        deliveries.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
  };
  let clock = now;
  const prisma = {
    withSessionAdvisoryLock: async (
      _key: string,
      fn: Function,
      signal: AbortSignal
    ) => fn(signal),
    withTenant: async (_org: string, fn: Function) => {
      transactionDepth++;
      try {
        return await fn(tx);
      } finally {
        transactionDepth--;
      }
    },
    organization: {
      findMany: async ({ cursor }: any) => (cursor ? [] : [{ id: "org" }]),
    },
  };
  let result = {
    responseStatus: 200 as number | null,
    errorCode: null as string | null,
  };
  let sendHook: (() => Promise<void>) | undefined;
  const transport: WebhookTransport = {
    send: async (target, body, headers, gate) => {
      const open = () => {
        expect(transactionDepth).toBe(0);
        sends.push({ target, body, headers });
        return true;
      };
      if (gate) {
        if (!(await gate(open, new AbortController().signal)))
          return { responseStatus: null, errorCode: "SUBSCRIPTION_CHANGED" };
      } else open();
      await sendHook?.();
      return result;
    },
  };
  const worker = new WebhookWorker(
    prisma as unknown as PrismaService,
    transport
  );
  return {
    worker,
    row,
    subscription,
    deliveries,
    audits,
    sends,
    prisma,
    management: new WebhooksService(prisma as unknown as PrismaService),
    setResult: (value: typeof result) => {
      result = value;
    },
    setClock: (value: Date) => {
      clock = value;
    },
    setSendHook: (hook: () => Promise<void>) => {
      sendHook = hook;
    },
    setStartWriteHook: (hook: () => void) => {
      startWriteHook = hook;
    },
  };
}
describe("webhook worker lease and delivery state", () => {
  const previous = process.env.WEBHOOK_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.WEBHOOK_ENCRYPTION_KEY = key;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.WEBHOOK_ENCRYPTION_KEY;
    else process.env.WEBHOOK_ENCRYPTION_KEY = previous;
  });
  it.each(["disabled", "url"])(
    "blocks a committed %s edit during DNS before opening HTTPS",
    async change => {
      const f = fixture();
      let releaseDns!: (addresses: LookupAddress[]) => void;
      let dnsStarted!: () => void;
      const resolving = new Promise<void>(r => (dnsStarted = r));
      let connections = 0;
      const transport = new HttpsWebhookTransport({
        resolve: () => {
          dnsStarted();
          return new Promise(r => (releaseDns = r));
        },
        request: (_options, response) => {
          connections++;
          return Object.assign(new EventEmitter(), {
            end: () =>
              queueMicrotask(() =>
                response({ statusCode: 200, destroy() {} } as IncomingMessage)
              ),
            destroy() {},
          }) as ClientRequest;
        },
      });
      const work = new WebhookWorker(
        f.prisma as unknown as PrismaService,
        transport
      ).processNext("org", now);
      await resolving;
      await f.management.update(
        f.subscription.id,
        {
          version: 1,
          ...(change === "disabled"
            ? { isActive: false }
            : { targetUrl: "https://example.net" }),
        },
        {
          organizationId: "org",
          actorUserId: randomUUID(),
          requestId: "edit-during-dns",
        }
      );
      releaseDns([{ address: "8.8.8.8", family: 4 }]);
      await work;
      expect(connections).toBe(0);
      expect(f.row.status).toBe("CANCELLED");
      expect(f.deliveries).toEqual([]);
    }
  );
  it.each([200, 503])(
    "records actual HTTP %s after a committed edit without reviving obsolete retries",
    async status => {
      const f = fixture();
      let respond!: (response: IncomingMessage) => void;
      let opened!: () => void;
      const started = new Promise<void>(r => (opened = r));
      const transport = new HttpsWebhookTransport({
        resolve: async () => [{ address: "8.8.8.8", family: 4 }],
        request: (_options, response) => {
          respond = response;
          return Object.assign(new EventEmitter(), {
            end: opened,
            destroy() {},
          }) as ClientRequest;
        },
      });
      const worker = new WebhookWorker(
        f.prisma as unknown as PrismaService,
        transport
      );
      const work = worker.processNext("org", now);
      await started;
      await f.management.update(
        f.subscription.id,
        { version: 1, isActive: false },
        {
          organizationId: "org",
          actorUserId: randomUUID(),
          requestId: "edit-after-request",
        }
      );
      respond({ statusCode: status, destroy() {} } as IncomingMessage);
      await work;
      expect(f.deliveries).toEqual([
        expect.objectContaining({
          attempt: 1,
          status: status === 200 ? "DELIVERED" : "FAILED",
          responseStatus: status,
          errorCode: status === 200 ? null : "HTTP_ERROR",
        }),
      ]);
      expect(f.row).toMatchObject({
        status: "CANCELLED",
        nextAttemptAt: null,
        leaseToken: null,
      });
      expect(await worker.processNext("org", now)).toBe(false);
    }
  );
  it("signs the exact body, records successful attempt outside transaction, and never replays it", async () => {
    const f = fixture();
    expect(await f.worker.processNext("org", now)).toBe(true);
    expect(f.sends).toHaveLength(1);
    const sent = f.sends[0];
    expect(
      verifyWebhookSignature(
        sent.body,
        "secret",
        sent.headers["X-Axes-Signature"]
      )
    ).toBe(true);
    expect(sent.headers).toMatchObject({
      "X-Axes-Event-Id": f.row.eventId,
      "X-Axes-Event-Type": "company.created",
      "X-Axes-Attempt": "1",
    });
    expect(f.row).toMatchObject({
      status: "DELIVERED",
      attemptCount: 1,
      leaseToken: null,
      nextAttemptAt: null,
    });
    expect(f.deliveries).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "DELIVERED",
        responseStatus: 200,
        errorCode: null,
      }),
    ]);
    expect(await f.worker.processNext("org", now)).toBe(false);
    expect(f.sends).toHaveLength(1);
  });
  it("retries DNS failure with stable ID at 30/60/120/240 seconds then exhausts at five", async () => {
    const f = fixture();
    f.setResult({ responseStatus: null, errorCode: "DNS_FAILED" });
    let time = now;
    for (let attempt = 1; attempt <= 5; attempt++) {
      f.setClock(time);
      await f.worker.processNext("org", time);
      expect(f.row.attemptCount).toBe(attempt);
      expect(f.deliveries.at(-1)).toMatchObject({
        attempt,
        status: "FAILED",
        errorCode: "DNS_FAILED",
      });
      if (attempt < 5) {
        expect(f.row.nextAttemptAt).toEqual(
          new Date(time.getTime() + 30000 * 2 ** (attempt - 1))
        );
        time = f.row.nextAttemptAt!;
      }
    }
    expect(f.row.status).toBe("EXHAUSTED");
    expect(f.sends).toHaveLength(5);
    expect(new Set(f.sends.map(s => s.headers["X-Axes-Event-Id"])).size).toBe(
      1
    );
    expect(f.audits).toEqual([
      expect.objectContaining({
        actorUserId: null,
        requestId: "request",
        metadata: {
          actorType: "SYSTEM",
          actorId: "webhook-worker",
          attemptCount: 5,
          errorCode: "DNS_FAILED",
        },
      }),
    ]);
  });
  it.each(["disabled", "url", "event"])(
    "cancels %s subscriptions before connecting without inventing attempts",
    async change => {
      const f = fixture();
      if (change === "disabled") f.subscription.isActive = false;
      if (change === "url") f.subscription.targetUrl = "https://example.net";
      if (change === "event") f.subscription.eventTypes = [];
      await f.worker.processNext("org", now);
      expect(f.row.status).toBe("CANCELLED");
      expect(f.sends).toHaveLength(0);
      expect(f.deliveries).toHaveLength(0);
    }
  );
  it("continues after a name-only subscription version change", async () => {
    const f = fixture();
    f.subscription.version = 2;
    await f.worker.processNext("org", now);
    expect(f.row.status).toBe("DELIVERED");
  });
  it("recovers an expired lease as immutable failure before another attempt", async () => {
    const f = fixture();
    Object.assign(f.row, {
      status: "PROCESSING",
      attemptCount: 1,
      lockedUntil: now,
      leaseToken: randomUUID(),
    });
    await f.worker.processNext("org", now);
    expect(f.deliveries).toEqual([
      expect.objectContaining({
        attempt: 1,
        errorCode: "LEASE_EXPIRED",
        status: "FAILED",
      }),
      expect.objectContaining({ attempt: 2, status: "DELIVERED" }),
    ]);
    expect(f.row.attemptCount).toBe(2);
  });
  it("exhausts an abandoned fifth attempt without opening a new connection", async () => {
    const f = fixture();
    Object.assign(f.row, {
      status: "PROCESSING",
      attemptCount: 5,
      lockedUntil: now,
      leaseToken: randomUUID(),
    });
    await f.worker.processNext("org", now);
    expect(f.row.status).toBe("EXHAUSTED");
    expect(f.sends).toHaveLength(0);
    expect(f.deliveries).toEqual([
      expect.objectContaining({ attempt: 5, errorCode: "LEASE_EXPIRED" }),
    ]);
  });
  it("discards a late response whose lease token has been replaced", async () => {
    const f = fixture();
    f.setSendHook(async () => {
      f.row.leaseToken = randomUUID();
    });
    await f.worker.processNext("org", now);
    expect(f.deliveries).toHaveLength(0);
    expect(f.row.status).toBe("PROCESSING");
  });
  it("recovers a cancelled started attempt after process death without replay or stale overwrite", async () => {
    const f = fixture();
    Object.assign(f.row, {
      status: "CANCELLED",
      attemptCount: 1,
      requestStartedAt: now,
      lockedUntil: now,
      leaseToken: randomUUID(),
    });
    expect(await f.worker.processNext("org", now)).toBe(true);
    expect(f.deliveries).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "FAILED",
        errorCode: "LEASE_EXPIRED",
      }),
    ]);
    expect(f.sends).toHaveLength(0);
    expect(f.row).toMatchObject({
      status: "CANCELLED",
      leaseToken: null,
      requestStartedAt: null,
    });
    expect(await f.worker.processNext("org", now)).toBe(false);
  });
  it("never changes a replacement owner's marker when the connection gate expires during its final write", async () => {
    const f = fixture();
    const replacement = randomUUID(),
      held = new AbortController();
    f.prisma.withSessionAdvisoryLock = async (_key, operation) =>
      operation(held.signal);
    f.setStartWriteHook(() => {
      held.abort();
      Object.assign(f.row, {
        status: "RETRY_SCHEDULED",
        leaseToken: replacement,
        requestStartedAt: null,
      });
    });
    await f.worker.processNext("org", now);
    expect(f.row).toMatchObject({
      status: "RETRY_SCHEDULED",
      leaseToken: replacement,
      requestStartedAt: null,
    });
    expect(f.sends).toEqual([]);
    expect(f.deliveries).toEqual([]);
  });
  it("does not access data or send when encryption is unavailable", async () => {
    delete process.env.WEBHOOK_ENCRYPTION_KEY;
    const f = fixture();
    await f.worker.processNext("org", now);
    expect(f.row.attemptCount).toBe(0);
    expect(f.sends).toHaveLength(0);
  });
  it("paginates active organizations and visits one queue per organization per cycle", async () => {
    const visited: string[] = [],
      pages: any[] = [];
    const prisma = {
      organization: {
        findMany: async (args: any) => {
          pages.push(args);
          return pages.length === 1
            ? Array.from({ length: 100 }, (_, i) => ({ id: `org-${i}` }))
            : [{ id: "last-org" }];
        },
      },
      withTenant: async (org: string, fn: Function) => {
        visited.push(org);
        return fn({ $queryRaw: async () => [], $executeRaw: async () => 1 });
      },
    };
    const worker = new WebhookWorker(prisma as unknown as PrismaService, {
      send: async () => {
        throw Error("No dispatch should send");
      },
    });
    await worker.runCycle(now);
    expect(visited).toHaveLength(101);
    expect(new Set(visited).size).toBe(101);
    expect(pages[0]).toMatchObject({ where: { isActive: true }, take: 100 });
    expect(pages[1]).toMatchObject({ cursor: { id: "org-99" }, skip: 1 });
  });
  it("keeps overlapping cycles from delivering a second job while the first is in flight", async () => {
    const f = fixture();
    let release!: () => void;
    const blocked = new Promise<void>(r => (release = r));
    f.setSendHook(() => blocked);
    const first = f.worker.runCycle(now);
    await Promise.resolve();
    await Promise.resolve();
    await f.worker.runCycle(now);
    release();
    await first;
    expect(f.sends).toHaveLength(1);
  });
});

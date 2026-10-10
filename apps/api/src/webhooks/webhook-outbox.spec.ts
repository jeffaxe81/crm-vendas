import { CompaniesService } from "../companies/companies.service";
import type { PrismaService } from "../database/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { Prisma } from "../generated/prisma/client";
import { enqueueWebhookEvent } from "./webhook-outbox";
const context = {
  organizationId: "org",
  actorUserId: "actor",
  requestId: "request",
};
const now = new Date("2026-10-09T00:00:00Z");
describe("transactional webhook outbox", () => {
  it("fans out one minimal stable event to the active matching subscriptions", async () => {
    const writes: any[] = [];
    let filter: any;
    const tenant = {
      webhookSubscription: {
        findMany: async (args: any) => {
          filter = args;
          return [
            {
              id: "s1",
              version: 2,
              targetUrl: "https://example.com",
              encryptedSecret: "cipher",
            },
            {
              id: "s2",
              version: 1,
              targetUrl: "https://example.net",
              encryptedSecret: "cipher2",
            },
          ];
        },
      },
      webhookDispatch: {
        createMany: async ({ data }: any) => {
          writes.push(...data);
        },
      },
    };
    await enqueueWebhookEvent(tenant as unknown as Prisma.TransactionClient, {
      ...context,
      eventType: "company.created",
      entityId: "entity",
      entityVersion: 1,
      occurredAt: now,
    });
    expect(filter).toBeDefined();
    expect(filter?.where).toEqual({
      organizationId: "org",
      isActive: true,
      eventTypes: { has: "company.created" },
    });
    expect(writes).toHaveLength(2);
    expect(writes[0].eventId).toBe(writes[1].eventId);
    expect(writes[0].payload).toEqual({
      id: writes[0].eventId,
      type: "company.created",
      version: 1,
      occurredAt: now.toISOString(),
      organizationId: "org",
      data: { entityId: "entity", version: 1 },
    });
    expect(writes[0]).toMatchObject({
      subscriptionId: "s1",
      subscriptionVersion: 2,
      requestId: "request",
      nextAttemptAt: now,
    });
  });
  it("company creation persists dispatches using the business transaction", async () => {
    const dispatches: any[] = [];
    const tenant = {
      company: { create: async () => ({ id: "entity", version: 1 }) },
      webhookSubscription: {
        findMany: async () => [
          {
            id: "s1",
            version: 1,
            targetUrl: "https://example.com",
            encryptedSecret: "cipher",
          },
        ],
      },
      webhookDispatch: {
        createMany: async ({ data }: any) => {
          dispatches.push(...data);
        },
      },
    };
    const prisma = {
      withTenant: async (_org: string, fn: Function) => fn(tenant),
    };
    const service = new CompaniesService(
      prisma as unknown as PrismaService,
      { record: async () => {} } as unknown as AuditService
    );
    await service.create({ legalName: "private name" }, context);
    expect(dispatches).toHaveLength(1);
    expect(JSON.stringify(dispatches[0].payload)).not.toContain("private name");
  });
});

import { OpportunitiesService } from "../opportunities/opportunities.service";
import { TicketsService } from "../tickets/tickets.service";
import type { TicketSatisfactionService } from "../tickets/ticket-satisfaction.service";
function domainFixture(
  kind: "OPEN" | "WON" | "LOST" = "WON",
  conflict = false
) {
  const dispatches: any[] = [];
  const opportunity = {
    id: "entity",
    organizationId: "org",
    pipelineId: "pipeline",
    stageId: "current",
    version: 1,
    estimatedValue: { toFixed: () => "0.00" },
    expectedCloseAt: null,
  };
  let ticket = {
    id: "entity",
    version: 1,
    status: "RESOLVED",
    firstResponseAt: now,
    openedAt: now,
    resolvedAt: now,
    closedAt: null,
    firstResponseDueAt: null,
    resolutionDueAt: null,
  };
  const tx = {
    webhookSubscription: {
      findMany: async () => [
        {
          id: "s1",
          version: 1,
          targetUrl: "https://example.com",
          encryptedSecret: "cipher",
        },
      ],
    },
    webhookDispatch: {
      createMany: async ({ data }: any) => {
        dispatches.push(...data);
      },
    },
    pipeline: { findFirst: async () => ({ id: "pipeline" }) },
    pipelineStage: {
      findFirst: async ({ where }: any) => ({
        id: where.id,
        kind: where.id === "current" ? "OPEN" : kind,
      }),
    },
    organizationMembership: { findFirst: async () => ({ id: "member" }) },
    company: { findFirst: async () => ({ id: "company" }) },
    opportunity: {
      create: async () => ({ ...opportunity, stageId: "target" }),
      findFirst: async () => ({ ...opportunity }),
      updateMany: async () => ({ count: conflict ? 0 : 1 }),
    },
    ticket: {
      findFirst: async () => ({ ...ticket }),
      updateMany: async ({ data }: any) => {
        if (conflict) return { count: 0 };
        ticket = { ...ticket, ...data, version: 2 };
        return { count: 1 };
      },
    },
    ticketEvent: { create: async () => ({}) },
  };
  const prisma = {
    withTenant: async (_org: string, fn: Function) => fn(tx),
  } as unknown as PrismaService;
  const audit = { record: async () => {} } as unknown as AuditService;
  return {
    dispatches,
    opportunities: new OpportunitiesService(prisma, audit),
    tickets: new TicketsService(
      prisma,
      audit,
      () => now,
      {} as TicketSatisfactionService
    ),
  };
}
describe("domain event boundaries", () => {
  it.each(["WON", "LOST"] as const)(
    "emits opportunity.%s when created already final",
    async kind => {
      const f = domainFixture(kind);
      await f.opportunities.create(
        {
          pipelineId: "pipeline",
          stageId: "target",
          companyId: "company",
          ownerUserId: "actor",
          title: "private title",
          estimatedValue: "0.00",
        },
        context
      );
      expect(f.dispatches).toHaveLength(1);
      expect(f.dispatches[0].eventType).toBe(
        `opportunity.${kind.toLowerCase()}`
      );
      expect(JSON.stringify(f.dispatches[0].payload)).not.toContain(
        "private title"
      );
    }
  );
  it.each(["WON", "LOST"] as const)(
    "emits opportunity.%s on an OPEN move",
    async kind => {
      const f = domainFixture(kind);
      await f.opportunities.move(
        "entity",
        { stageId: "target", version: 1 },
        context
      );
      expect(f.dispatches).toHaveLength(1);
      expect(f.dispatches[0].eventType).toBe(
        `opportunity.${kind.toLowerCase()}`
      );
    }
  );
  it("does not emit for an OPEN stage or a failed optimistic move", async () => {
    const open = domainFixture("OPEN");
    await open.opportunities.move(
      "entity",
      { stageId: "target", version: 1 },
      context
    );
    expect(open.dispatches).toEqual([]);
    const stale = domainFixture("WON", true);
    await expect(
      stale.opportunities.move(
        "entity",
        { stageId: "target", version: 1 },
        context
      )
    ).rejects.toThrow();
    expect(stale.dispatches).toEqual([]);
  });
  it("emits ticket.closed at the committed entity version", async () => {
    const f = domainFixture();
    await f.tickets.changeStatus(
      "entity",
      { version: 1, status: "CLOSED" },
      context,
      now
    );
    expect(f.dispatches).toHaveLength(1);
    expect(f.dispatches[0].payload.data).toEqual({
      entityId: "entity",
      version: 2,
    });
  });
  it("does not emit ticket.closed after an optimistic conflict", async () => {
    const f = domainFixture("WON", true);
    await expect(
      f.tickets.changeStatus(
        "entity",
        { version: 1, status: "CLOSED" },
        context,
        now
      )
    ).rejects.toThrow();
    expect(f.dispatches).toEqual([]);
  });
});

import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";

// These tests require real PostgreSQL with schema-owner and non-BYPASSRLS roles.
// They intentionally fail if CI forgot to provision its restricted role.
describe("webhook PostgreSQL tenant and append-only invariants", () => {
  let owner: PrismaService;
  let restricted: PrismaService;
  let maintainer: PrismaService;
  let orgA: string;
  let orgB: string;
  let userId: string;
  let subscriptionA: string;
  let subscriptionB: string;
  let dispatchId: string;
  let deliveryId: string;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);
    maintainer = new PrismaService(process.env.RLS_DATABASE_URL);
  });
  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    userId = (
      await owner.user.create({
        data: {
          email: "webhook-rls@example.test",
          emailNormalized: "webhook-rls@example.test",
          displayName: "Webhook RLS",
          passwordHash: "synthetic",
        },
      })
    ).id;
    orgA = (
      await owner.organization.create({
        data: { name: "Webhook A", slug: "webhook-a" },
      })
    ).id;
    orgB = (
      await owner.organization.create({
        data: { name: "Webhook B", slug: "webhook-b" },
      })
    ).id;
    subscriptionA = (
      await restricted.withTenant(orgA, tx =>
        tx.webhookSubscription.create({ data: subscriptionData(orgA) })
      )
    ).id;
    subscriptionB = (
      await restricted.withTenant(orgB, tx =>
        tx.webhookSubscription.create({ data: subscriptionData(orgB) })
      )
    ).id;
    dispatchId = (
      await restricted.withTenant(orgA, tx =>
        tx.webhookDispatch.create({ data: dispatchData(orgA, subscriptionA) })
      )
    ).id;
    deliveryId = (
      await restricted.withTenant(orgA, tx =>
        tx.webhookDelivery.create({ data: deliveryData() })
      )
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
    await maintainer?.onModuleDestroy();
  });
  function subscriptionData(organizationId: string) {
    return {
      organizationId,
      name: "ERP",
      targetUrl: "https://example.com/events",
      eventTypes: ["company.created"],
      encryptedSecret: "encrypted-test-snapshot",
      createdBy: userId,
    };
  }
  function dispatchData(organizationId: string, subscriptionId: string) {
    return {
      organizationId,
      subscriptionId,
      subscriptionVersion: 1,
      eventId: randomUUID(),
      eventType: "company.created",
      payload: { version: 1, entityId: randomUUID() },
      targetUrl: "https://example.com/events",
      encryptedSecret: "encrypted-test-snapshot",
      requestId: "request",
    };
  }
  function deliveryData() {
    return {
      organizationId: orgA,
      subscriptionId: subscriptionA,
      dispatchId,
      attempt: 1,
      status: "DELIVERED",
      responseStatus: 200,
    };
  }
  it("forces RLS on every webhook table and gives the runtime no bypass", async () => {
    const flags = await owner.$queryRawUnsafe<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('webhook_subscriptions','webhook_dispatches','webhook_deliveries') ORDER BY relname"
    );
    expect(flags).toHaveLength(3);
    for (const flag of flags)
      expect(flag).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    const roles = await restricted.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
    );
    expect(roles).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });
  it("requires tenant context and hides all three models across organizations", async () => {
    expect(await restricted.webhookSubscription.findMany()).toEqual([]);
    expect(await restricted.webhookDispatch.findMany()).toEqual([]);
    expect(await restricted.webhookDelivery.findMany()).toEqual([]);
    expect(
      await restricted.withTenant(orgB, tx =>
        tx.webhookSubscription.findMany({ where: { id: subscriptionA } })
      )
    ).toEqual([]);
    expect(
      await restricted.withTenant(orgB, tx => tx.webhookDispatch.findMany())
    ).toEqual([]);
    expect(
      await restricted.withTenant(orgB, tx => tx.webhookDelivery.findMany())
    ).toEqual([]);
  });
  it("rejects foreign tenant writes through all three models", async () => {
    await expect(
      restricted.withTenant(orgB, tx =>
        tx.webhookSubscription.create({ data: subscriptionData(orgA) })
      )
    ).rejects.toThrow();
    await expect(
      restricted.withTenant(orgB, tx =>
        tx.webhookDispatch.create({ data: dispatchData(orgA, subscriptionA) })
      )
    ).rejects.toThrow();
    await expect(
      restricted.withTenant(orgB, tx =>
        tx.webhookDelivery.create({ data: { ...deliveryData(), attempt: 2 } })
      )
    ).rejects.toThrow();
  });
  it("rejects cross-organization subscription and dispatch references", async () => {
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDispatch.create({ data: dispatchData(orgA, subscriptionB) })
      )
    ).rejects.toThrow();
    await expect(
      restricted.withTenant(orgB, tx =>
        tx.webhookDelivery.create({
          data: {
            ...deliveryData(),
            organizationId: orgB,
            subscriptionId: subscriptionB,
            attempt: 2,
          },
        })
      )
    ).rejects.toThrow();
  });
  it("rejects a delivery linked to a different subscription even in the same organization", async () => {
    const other = await restricted.withTenant(orgA, tx =>
      tx.webhookSubscription.create({ data: subscriptionData(orgA) })
    );
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDelivery.create({
          data: { ...deliveryData(), subscriptionId: other.id, attempt: 2 },
        })
      )
    ).rejects.toThrow();
  });
  it("prevents attempt overwrite/delete even for the schema owner and maintenance bypass", async () => {
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: { responseStatus: 201 },
        })
      )
    ).rejects.toThrow();
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDelivery.delete({ where: { id: deliveryId } })
      )
    ).rejects.toThrow();
    await expect(
      owner.withTenant(orgA, async tx => {
        expect(
          await tx.webhookDelivery.findFirst({ where: { id: deliveryId } })
        ).toMatchObject({ id: deliveryId, attempt: 1 });
        return tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: { attempt: 2 },
        });
      })
    ).rejects.toThrow(/webhook delivery attempts are immutable/);
    await expect(
      maintainer.withMaintenance(orgA, tx =>
        tx.webhookDelivery.delete({ where: { id: deliveryId } })
      )
    ).rejects.toThrow();
    expect(
      await restricted.withTenant(orgA, tx => tx.webhookDelivery.count())
    ).toBe(1);
  });
  it("rejects duplicate attempts and duplicate fan-out event IDs", async () => {
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDelivery.create({ data: deliveryData() })
      )
    ).rejects.toThrow();
    const original = await restricted.withTenant(orgA, tx =>
      tx.webhookDispatch.findFirstOrThrow({ where: { id: dispatchId } })
    );
    await expect(
      restricted.withTenant(orgA, tx =>
        tx.webhookDispatch.create({
          data: {
            ...dispatchData(orgA, subscriptionA),
            eventId: original.eventId,
          },
        })
      )
    ).rejects.toThrow();
  });
  it("serializes optimistic management edits and protects secrets in real tenant reads", async () => {
    const service = new WebhooksService(restricted);
    const context = {
      organizationId: orgA,
      actorUserId: userId,
      requestId: "concurrent-edit",
    };
    const edits = await Promise.allSettled([
      service.update(subscriptionA, { version: 1, name: "First" }, context),
      service.update(subscriptionA, { version: 1, name: "Second" }, context),
    ]);
    expect(edits.filter(result => result.status === "fulfilled")).toHaveLength(
      1
    );
    const rejected = edits.find(result => result.status === "rejected");
    expect(
      rejected?.status === "rejected" ? rejected.reason : undefined
    ).toBeInstanceOf(ConflictException);
    const list = await service.list(orgA);
    expect(list[0]?.version).toBe(2);
    expect(JSON.stringify(list)).not.toContain("encrypted-test-snapshot");
    const history = await service.history(subscriptionA, orgA);
    expect(history).toHaveLength(1);
    expect(history[0]?.deliveries[0]).toMatchObject({
      attempt: 1,
      status: "DELIVERED",
      responseStatus: 200,
    });
    expect(JSON.stringify(history)).not.toContain("encrypted-test-snapshot");
    expect(history[0]).not.toHaveProperty("payload");
    expect(history[0]).not.toHaveProperty("targetUrl");
    await expect(service.history(subscriptionA, orgB)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(
      service.update(
        subscriptionA,
        { version: 2, isActive: false },
        { ...context, organizationId: orgB }
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("makes inserts into every webhook table wait for tenant maintenance", async () => {
    for (const model of ["subscription", "dispatch", "delivery"] as const) {
      let acquired!: () => void;
      let release!: () => void;
      const locked = new Promise<void>(resolve => {
        acquired = resolve;
      });
      const unlock = new Promise<void>(resolve => {
        release = resolve;
      });
      const maintenance = maintainer.withMaintenance(orgA, async () => {
        acquired();
        await unlock;
      });
      await locked;
      let completed = false;
      const write = restricted.withTenant(orgA, async tx => {
        if (model === "subscription")
          await tx.webhookSubscription.create({ data: subscriptionData(orgA) });
        else if (model === "dispatch")
          await tx.webhookDispatch.create({
            data: dispatchData(orgA, subscriptionA),
          });
        else
          await tx.webhookDelivery.create({
            data: { ...deliveryData(), attempt: 2 },
          });
        completed = true;
      });
      try {
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(completed).toBe(false);
        await owner.$queryRawUnsafe("SELECT 1");
      } finally {
        release();
        await maintenance;
        await write;
      }
      expect(completed).toBe(true);
    }
  });
});

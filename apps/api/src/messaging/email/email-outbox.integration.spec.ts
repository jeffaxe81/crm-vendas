import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { composeSlaDueEmail } from "./email-composer";
import { enqueueTransactionalEmail } from "./email-outbox";
import { EmailOutboxWorker } from "./email-outbox.worker";
import { EmailDeliveryUnknownError } from "./email-provider";
import type { EmailProvider, TransactionalEmail } from "./email-provider";

describe("F4.3 email outbox PostgreSQL RLS and leases", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  let ticketId: string;
  let otherTicketId: string;
  let userId: string;
  const key = Buffer.alloc(32, 7).toString("base64");
  const original = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
  // Fixed future clock keeps due-at claims deterministic across CI runtimes.
  const when = new Date("2099-10-10T12:00:00.000Z");

  const email = (): TransactionalEmail =>
    composeSlaDueEmail({
      organizationId,
      ticketId,
      protocol: "2026-000101",
      recipient: "email-outbox@example.test",
      dueAt: new Date(when.getTime() + 25 * 60000),
      minutesRemaining: 25,
    });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
  });

  beforeEach(async () => {
    process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = key;
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    userId = (
      await owner.user.create({
        data: {
          email: "email-outbox@example.test",
          emailNormalized: "email-outbox@example.test",
          displayName: "Email Outbox",
          passwordHash: "synthetic",
        },
      })
    ).id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Mail A", slug: "mail-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Mail B", slug: "mail-b" },
      })
    ).id;
    await owner.organizationMembership.create({
      data: { organizationId, userId, role: "SELLER" },
    });
    ticketId = (
      await owner.ticket.create({
        data: {
          organizationId,
          protocol: "2026-000101",
          subject: "Tenant A",
          assigneeUserId: userId,
          firstResponseDueAt: new Date(when.getTime() + 25 * 60000),
          createdBy: userId,
          updatedBy: userId,
        },
      })
    ).id;
    otherTicketId = (
      await owner.ticket.create({
        data: {
          organizationId: otherOrganizationId,
          protocol: "2026-000102",
          subject: "Tenant B",
          createdBy: userId,
          updatedBy: userId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
    if (original === undefined) delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    else process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = original;
  });

  it("enforces FORCE RLS and refuses cross-tenant inserts", async () => {
    const [flag] = await owner.$queryRaw<
      { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'email_outbox'`;
    expect(flag).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    const [role] = await app.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });

    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    expect(await app.emailOutbox.findMany()).toEqual([]);
    expect(
      await app.withTenant(otherOrganizationId, tx => tx.emailOutbox.findMany())
    ).toEqual([]);
    await expect(
      app.withTenant(otherOrganizationId, tx =>
        enqueueTransactionalEmail(tx, email())
      )
    ).rejects.toThrow();
    await expect(
      app.withTenant(organizationId, tx =>
        enqueueTransactionalEmail(tx, {
          ...email(),
          referenceId: otherTicketId,
          idempotencyKey: "different-key",
        })
      )
    ).rejects.toThrow();
  });

  it("deduplicates atomically and keeps recipient/body encrypted at rest", async () => {
    const first = await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    const repeated = await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    expect(first).toBe(true);
    expect(repeated).toBe(false);
    const rows = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findMany()
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(email().recipient);
    expect(JSON.stringify(rows)).not.toContain(email().text);
    expect(rows[0]).toMatchObject({
      status: "PENDING",
      purpose: "SLA_DUE_SOON",
      attemptCount: 0,
    });
    await expect(
      app.withTenant(organizationId, async tx => {
        await enqueueTransactionalEmail(tx, {
          ...email(),
          idempotencyKey: "roll-back",
        });
        throw Error("business transaction failed");
      })
    ).rejects.toThrow("business transaction failed");
    expect(
      await app.withTenant(organizationId, tx => tx.emailOutbox.count())
    ).toBe(1);
  });

  it("accepts once after commit and never sends an accepted email again", async () => {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    const received: TransactionalEmail[] = [];
    const provider: EmailProvider = {
      send: async payload => {
        received.push(payload);
        return { providerMessageId: "accepted-1" };
      },
    };
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService(provider)
    );
    expect(await worker.processNext(organizationId, when)).toBe(true);
    expect(received).toEqual([email()]);
    expect(await worker.processNext(organizationId, when)).toBe(false);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    expect(row).toMatchObject({
      status: "ACCEPTED",
      attemptCount: 1,
      providerMessageId: "accepted-1",
      leaseToken: null,
      leasedUntil: null,
    });
  });

  it("retries with bounded backoff and stops after five failed attempts", async () => {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    let calls = 0;
    const provider: EmailProvider = {
      send: async () => {
        calls++;
        throw Error("provider private response");
      },
    };
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService(provider)
    );
    let current = when;
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await worker.processNext(organizationId, current)).toBe(true);
      const row = await app.withTenant(organizationId, tx =>
        tx.emailOutbox.findFirstOrThrow()
      );
      expect(row.attemptCount).toBe(attempt);
      expect(row.status).toBe(attempt === 5 ? "EXHAUSTED" : "RETRY_SCHEDULED");
      expect(row.lastErrorCode).toBe("PROVIDER_ERROR");
      current = new Date(current.getTime() + 30000 * 2 ** (attempt - 1));
    }
    expect(calls).toBe(5);
    expect(await worker.processNext(organizationId, current)).toBe(false);
  });

  it("quarantines an expired lease rather than risking a duplicated send", async () => {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    await app.withTenant(organizationId, tx =>
      tx.emailOutbox.updateMany({
        where: { organizationId },
        data: {
          status: "PROCESSING",
          attemptCount: 1,
          leaseToken: randomUUID(),
          leasedUntil: new Date(when.getTime() - 1000),
          nextAttemptAt: null,
        },
      })
    );
    let sent = 0;
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService({
        send: async () => {
          sent++;
          return { providerMessageId: "unexpected" };
        },
      })
    );
    expect(await worker.processNext(organizationId, when)).toBe(true);
    expect(sent).toBe(0);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    expect(row).toMatchObject({
      attemptCount: 1,
      status: "MANUAL_REVIEW",
      lastErrorCode: "LEASE_EXPIRED_UNKNOWN",
      leaseToken: null,
      leasedUntil: null,
      nextAttemptAt: null,
    });
    expect(await worker.processNext(organizationId, when)).toBe(false);
  });

  it("quarantines unknown provider acceptance without automatic retry", async () => {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    let calls = 0;
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService({
        send: async () => {
          calls++;
          throw new EmailDeliveryUnknownError();
        },
      })
    );
    expect(await worker.processNext(organizationId, when)).toBe(true);
    expect(calls).toBe(1);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    expect(row).toMatchObject({
      status: "MANUAL_REVIEW",
      attemptCount: 1,
      lastErrorCode: "DELIVERY_UNKNOWN",
      nextAttemptAt: null,
    });
    expect(await worker.processNext(organizationId, when)).toBe(false);
    expect(calls).toBe(1);
  });

  async function assertCancelledAfterMutation(
    changeTicket: () => Promise<unknown>
  ) {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    await changeTicket();
    const received: TransactionalEmail[] = [];
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService({
        send: async payload => {
          received.push(payload);
          return { providerMessageId: "should-not-send" };
        },
      })
    );
    expect(await worker.processNext(organizationId, when)).toBe(true);
    expect(received).toEqual([]);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    expect(row.status).toBe("CANCELLED");
    expect(row.lastErrorCode).toBe("STALE_OR_UNAUTHORIZED_ALERT");
    expect(row.nextAttemptAt).toBeNull();
    expect(await worker.processNext(organizationId, when)).toBe(false);
  }

  it("cancels a queued SLA alert when the ticket is closed", async () => {
    await assertCancelledAfterMutation(() =>
      owner.ticket.update({
        where: { id: ticketId },
        data: { status: "CLOSED" },
      })
    );
  });

  it("cancels a queued SLA alert when its deadline changes", async () => {
    await assertCancelledAfterMutation(() =>
      owner.ticket.update({
        where: { id: ticketId },
        data: { firstResponseDueAt: new Date(when.getTime() + 10 * 60000) },
      })
    );
  });

  it("cancels a queued SLA alert when the assignee membership is revoked", async () => {
    await assertCancelledAfterMutation(() =>
      owner.organizationMembership.updateMany({
        where: { organizationId, userId },
        data: { isActive: false },
      })
    );
  });

  it("cancels a queued SLA alert when the recipient changes", async () => {
    const replacement = await owner.user.create({
      data: {
        email: "replacement@example.test",
        emailNormalized: "replacement@example.test",
        displayName: "Replacement",
        passwordHash: "synthetic",
      },
    });
    await owner.organizationMembership.create({
      data: { organizationId, userId: replacement.id, role: "SELLER" },
    });
    await assertCancelledAfterMutation(() =>
      owner.ticket.update({
        where: { id: ticketId },
        data: { assigneeUserId: replacement.id },
      })
    );
  });

  it("cancels a queued SLA alert when the assignee user is disabled", async () => {
    await assertCancelledAfterMutation(() =>
      owner.user.update({
        where: { id: userId },
        data: { isActive: false },
      })
    );
  });

  it("cancels a queued SLA alert when its organization is disabled", async () => {
    await assertCancelledAfterMutation(() =>
      owner.organization.update({
        where: { id: organizationId },
        data: { isActive: false },
      })
    );
  });

  it("cancels a queued SLA alert when the SLA is moved outside the alert window", async () => {
    await assertCancelledAfterMutation(() =>
      owner.ticket.update({
        where: { id: ticketId },
        data: { firstResponseDueAt: new Date(when.getTime() + 90 * 60000) },
      })
    );
  });

  it("never sends CSAT mail before a separate consent gate is implemented", async () => {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, {
        ...email(),
        idempotencyKey: "satisfaction:consent-not-verified",
        purpose: "SATISFACTION_REQUEST",
      })
    );
    let calls = 0;
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService({
        send: async () => {
          calls += 1;
          return { providerMessageId: "unexpected" };
        },
      })
    );
    expect(await worker.processNext(organizationId, when)).toBe(true);
    expect(calls).toBe(0);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    expect(row.status).toBe("CANCELLED");
  });

  it("never dispatches without a validated encryption key", async () => {
    await app.withTenant(organizationId, tx =>
      enqueueTransactionalEmail(tx, email())
    );
    delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    let called = false;
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService({
        send: async () => {
          called = true;
          return { providerMessageId: "unexpected" };
        },
      })
    );
    expect(await worker.processNext(organizationId, when)).toBe(false);
    expect(called).toBe(false);
  });
});

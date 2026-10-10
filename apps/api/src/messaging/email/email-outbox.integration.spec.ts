import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { enqueueTransactionalEmail } from "./email-outbox";
import { EmailOutboxWorker } from "./email-outbox.worker";
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
  const when = new Date("2026-10-10T12:00:00.000Z");

  const email = (): TransactionalEmail => ({
    organizationId,
    referenceId: ticketId,
    idempotencyKey: `sla:${organizationId}:${ticketId}:v1`,
    purpose: "SLA_DUE_SOON",
    recipient: "test@example.com",
    subject: "SLA",
    text: "Private SLA notification",
    html: "<p>Private SLA notification</p>",
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
    ticketId = (
      await owner.ticket.create({
        data: {
          organizationId,
          protocol: "2026-101",
          subject: "Tenant A",
          createdBy: userId,
          updatedBy: userId,
        },
      })
    ).id;
    otherTicketId = (
      await owner.ticket.create({
        data: {
          organizationId: otherOrganizationId,
          protocol: "2026-102",
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

  it("reclaims an expired lease without allowing a stale send result to overwrite it", async () => {
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
    const worker = new EmailOutboxWorker(
      app,
      new EmailDispatchService({
        send: async () => ({ providerMessageId: "recovered" }),
      })
    );
    expect(await worker.processNext(organizationId, when)).toBe(true);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    expect(row).toMatchObject({
      attemptCount: 2,
      status: "ACCEPTED",
      providerMessageId: "recovered",
    });
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

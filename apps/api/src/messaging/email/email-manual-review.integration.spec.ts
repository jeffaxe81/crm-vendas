import { PrismaService } from "../../database/prisma.service";
import { EmailManualReviewService } from "./email-manual-review.service";
import { composeSlaDueEmail } from "./email-composer";
import { enqueueTransactionalEmail } from "./email-outbox";

describe("F4.3-02B2C manual email reconciliation (PostgreSQL RLS)", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let service: EmailManualReviewService;
  let organizationId: string;
  let anotherOrganizationId: string;
  let actorUserId: string;
  let sellerUserId: string;
  let reviewId: string;
  let otherReviewId: string;

  const key = Buffer.alloc(32, 9).toString("base64");
  const previousKey = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
  const dueAt = new Date("2099-10-10T12:25:00.000Z");
  const context = () => ({
    organizationId,
    actorUserId,
    requestId: "manual-review-integration-01",
    ipAddress: "127.0.0.1",
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    service = new EmailManualReviewService(app);
  });

  beforeEach(async () => {
    process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = key;
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    actorUserId = (
      await owner.user.create({
        data: {
          email: "email-admin@example.test",
          emailNormalized: "email-admin@example.test",
          displayName: "Email Administrator",
          passwordHash: "synthetic",
        },
      })
    ).id;
    sellerUserId = (
      await owner.user.create({
        data: {
          email: "email-seller@example.test",
          emailNormalized: "email-seller@example.test",
          displayName: "Email Seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Email Review A", slug: "email-review-a" },
      })
    ).id;
    anotherOrganizationId = (
      await owner.organization.create({
        data: { name: "Email Review B", slug: "email-review-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId, userId: actorUserId, role: "ADMIN" },
        { organizationId, userId: sellerUserId, role: "SELLER" },
        {
          organizationId: anotherOrganizationId,
          userId: actorUserId,
          role: "ADMIN",
        },
      ],
    });

    const ticketA = await owner.ticket.create({
      data: {
        organizationId,
        protocol: "2026-000201",
        subject: "Tenant A review",
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    const ticketB = await owner.ticket.create({
      data: {
        organizationId: anotherOrganizationId,
        protocol: "2026-000202",
        subject: "Tenant B review",
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });

    for (const [tenantId, ticketId, protocol] of [
      [organizationId, ticketA.id, ticketA.protocol],
      [anotherOrganizationId, ticketB.id, ticketB.protocol],
    ]) {
      const email = composeSlaDueEmail({
        organizationId: tenantId,
        ticketId,
        protocol,
        recipient: "private-recipient@example.test",
        dueAt,
        minutesRemaining: 25,
      });
      await app.withTenant(tenantId, async tx => {
        await enqueueTransactionalEmail(tx, email);
        await tx.emailOutbox.updateMany({
          where: { organizationId: tenantId },
          data: {
            status: "MANUAL_REVIEW",
            nextAttemptAt: null,
            lastErrorCode: "DELIVERY_UNKNOWN",
          },
        });
      });
    }
    reviewId = (
      await app.withTenant(organizationId, tx =>
        tx.emailOutbox.findFirstOrThrow()
      )
    ).id;
    otherReviewId = (
      await app.withTenant(anotherOrganizationId, tx =>
        tx.emailOutbox.findFirstOrThrow()
      )
    ).id;
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
    if (previousKey === undefined)
      delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    else process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = previousKey;
  });

  it("lists tenant reviews without exposing plaintext", async () => {
    const rows = await service.list(context());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(reviewId);
    expect(rows[0]).toHaveProperty("idempotencyHash");
    expect(JSON.stringify(rows)).not.toContain(
      "private-recipient@example.test"
    );
    expect(JSON.stringify(rows)).not.toContain("encryptedEmail");
    expect(JSON.stringify(rows)).not.toContain(otherReviewId);
  });

  it("rejects non-admin and cross-tenant resolutions", async () => {
    await expect(
      service.list({ ...context(), actorUserId: sellerUserId })
    ).rejects.toThrow();
    await expect(
      service.resolve(
        otherReviewId,
        {
          decision: "CONFIRMED_ACCEPTED",
          providerMessageId: "relay-2",
          evidenceReference: "relay/case-123456",
        },
        context()
      )
    ).rejects.toThrow();
    await owner.organizationMembership.updateMany({
      where: { organizationId, userId: actorUserId },
      data: { isActive: false },
    });
    await expect(service.list(context())).rejects.toThrow();
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow({ where: { id: reviewId } })
    );
    expect(row.status).toBe("MANUAL_REVIEW");
  });

  it("records accepted receipt once with audit", async () => {
    const resolution = {
      decision: "CONFIRMED_ACCEPTED" as const,
      evidenceReference: "relay/acceptance-001",
      providerMessageId: "relay-message-001",
    };
    expect(await service.resolve(reviewId, resolution, context())).toEqual({
      id: reviewId,
      status: "ACCEPTED",
    });
    await expect(
      service.resolve(reviewId, resolution, context())
    ).rejects.toThrow();
    const data = await app.withTenant(organizationId, tx =>
      Promise.all([
        tx.emailOutbox.findFirstOrThrow({ where: { id: reviewId } }),
        tx.auditLog.findMany({
          where: {
            organizationId,
            entityType: "EmailOutbox",
            entityId: reviewId,
          },
        }),
      ])
    );
    expect(data[0]).toMatchObject({
      status: "ACCEPTED",
      providerMessageId: "relay-message-001",
      nextAttemptAt: null,
      leasedUntil: null,
      leaseToken: null,
    });
    expect(data[1]).toHaveLength(1);
    expect(data[1][0]).toMatchObject({
      actorUserId,
      action: "email.manual_review.resolve",
      requestId: context().requestId,
    });
    expect(JSON.stringify(data[1])).not.toContain(
      "private-recipient@example.test"
    );
  });

  it("cancels confirmed non-acceptance without retry", async () => {
    expect(
      await service.resolve(
        reviewId,
        {
          decision: "CONFIRMED_NOT_ACCEPTED",
          evidenceReference: "relay/rejected-001",
        },
        context()
      )
    ).toEqual({ id: reviewId, status: "CANCELLED" });
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow({ where: { id: reviewId } })
    );
    expect(row).toMatchObject({
      status: "CANCELLED",
      lastErrorCode: "MANUAL_CONFIRMED_NOT_ACCEPTED",
      providerMessageId: null,
      nextAttemptAt: null,
    });
  });
});

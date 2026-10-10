import { PrismaService } from "../../database/prisma.service";
import { decryptOutboxEmail } from "./email-outbox-crypto";
import { SlaEmailPlanner } from "./sla-email-planner";

describe("F4.3-02B1 SLA alerts with PostgreSQL RLS", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let organizationId: string;
  let foreignOrg: string;
  let userId: string;
  const now = new Date("2026-10-10T12:00:00.000Z");
  const encryptionKey = Buffer.alloc(32, 13).toString("base64");
  const previousKey = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
  });

  beforeEach(async () => {
    process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = encryptionKey;
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const user = await owner.user.create({
      data: {
        email: "assigned@example.com",
        emailNormalized: "assigned@example.com",
        displayName: "Responsible",
        passwordHash: "synthetic",
      },
    });
    userId = user.id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Due A", slug: "due-a" },
      })
    ).id;
    foreignOrg = (
      await owner.organization.create({
        data: { name: "Due B", slug: "due-b" },
      })
    ).id;
    await owner.organizationMembership.create({
      data: {
        organizationId,
        userId,
        role: "SELLER",
      },
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
    if (previousKey === undefined)
      delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    else process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = previousKey;
  });

  async function ticket(fields: {
    organizationId?: string;
    protocol?: string;
    firstResponseDueAt?: Date;
    resolutionDueAt?: Date;
    firstResponseAt?: Date;
    assigneeUserId?: string | null;
    status?: "OPEN" | "IN_PROGRESS" | "CLOSED";
  } = {}) {
    return owner.ticket.create({
      data: {
        organizationId: fields.organizationId ?? organizationId,
        protocol: fields.protocol ?? "2026-000101",
        subject: "Example request",
        createdBy: userId,
        updatedBy: userId,
        assigneeUserId: fields.assigneeUserId ?? userId,
        firstResponseAt: fields.firstResponseAt,
        firstResponseDueAt: fields.firstResponseDueAt,
        resolutionDueAt: fields.resolutionDueAt,
        status: fields.status ?? "OPEN",
      },
    });
  }

  it("queues one encrypted alert to active assignee; replay cannot duplicate", async () => {
    const item = await ticket({
      firstResponseDueAt: new Date(now.getTime() + 15 * 60000),
      resolutionDueAt: new Date(now.getTime() + 25 * 60000),
    });
    const planner = new SlaEmailPlanner(app);
    expect(await planner.enqueueDueAlerts(organizationId, now)).toBe(1);
    expect(await planner.enqueueDueAlerts(organizationId, now)).toBe(0);
    const queue = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findMany()
    );
    expect(queue).toHaveLength(1);
    const record = queue[0]!;
    expect(JSON.stringify(record)).not.toContain("assigned@example.com");
    expect(record).toMatchObject({
      ticketId: item.id,
      organizationId,
      status: "PENDING",
      purpose: "SLA_DUE_SOON",
    });
    const decoded = decryptOutboxEmail(
      record.encryptedEmail,
      encryptionKey,
      organizationId,
      item.id,
      record.idempotencyHash
    );
    expect(decoded.recipient).toBe("assigned@example.com");
    expect(decoded.text).toContain("15 minutos");
    expect(decoded.idempotencyKey).toContain(
      new Date(now.getTime() + 15 * 60000).toISOString()
    );
    expect(await app.emailOutbox.findMany()).toEqual([]);
  });

  it("prefers resolution deadline when first response was recorded", async () => {
    const due = new Date(now.getTime() + 9 * 60000);
    await ticket({
      firstResponseAt: new Date(now.getTime() - 10000),
      firstResponseDueAt: new Date(now.getTime() + 2 * 60000),
      resolutionDueAt: due,
    });
    expect(await new SlaEmailPlanner(app).enqueueDueAlerts(organizationId, now))
      .toBe(1);
    const row = await app.withTenant(organizationId, tx =>
      tx.emailOutbox.findFirstOrThrow()
    );
    const decoded = decryptOutboxEmail(
      row.encryptedEmail, encryptionKey, organizationId, row.ticketId,
      row.idempotencyHash
    );
    expect(decoded.text).toContain("9 minutos");
    expect(decoded.idempotencyKey).toContain(due.toISOString());
  });

  it("skips inactive users, resolved tickets and deadlines outside window", async () => {
    await ticket({
      firstResponseDueAt: new Date(now.getTime() - 1000),
      protocol: "2026-000101",
    });
    await ticket({
      firstResponseDueAt: new Date(now.getTime() + 31 * 60000),
      protocol: "2026-000102",
    });
    await ticket({
      firstResponseDueAt: new Date(now.getTime() + 10 * 60000),
      protocol: "2026-000103",
      status: "CLOSED",
    });
    expect(await new SlaEmailPlanner(app).enqueueDueAlerts(organizationId, now))
      .toBe(0);
    await ticket({
      firstResponseDueAt: new Date(now.getTime() + 10 * 60000),
      protocol: "2026-000104",
    });
    await owner.organizationMembership.updateMany({
      where: { organizationId, userId },
      data: { isActive: false },
    });
    expect(await new SlaEmailPlanner(app).enqueueDueAlerts(organizationId, now))
      .toBe(0);
    expect(await app.withTenant(organizationId, tx =>
      tx.emailOutbox.count()
    )).toBe(0);
  });

  it("never queues another organization's ticket", async () => {
    await ticket({
      firstResponseDueAt: new Date(now.getTime() + 3 * 60000),
    });
    expect(await new SlaEmailPlanner(app).enqueueDueAlerts(foreignOrg, now))
      .toBe(0);
    expect(await app.withTenant(foreignOrg, tx => tx.emailOutbox.count()))
      .toBe(0);
    expect(await new SlaEmailPlanner(app).enqueueDueAlerts(organizationId, now))
      .toBe(1);
    expect(await app.withTenant(foreignOrg, tx => tx.emailOutbox.count()))
      .toBe(0);
  });

  it("processes later eligible pages without starving tickets after the first 100", async () => {
    await owner.ticket.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        organizationId,
        protocol: `2026-${String(index + 1).padStart(6, "0")}`,
        subject: "Bulk eligible",
        createdBy: userId,
        updatedBy: userId,
        assigneeUserId: userId,
        firstResponseDueAt: new Date(now.getTime() + 10 * 60000),
      })),
    });
    const planner = new SlaEmailPlanner(app);
    expect(await planner.enqueueDueAlerts(organizationId, now)).toBe(100);
    expect(await planner.enqueueDueAlerts(organizationId, now)).toBe(1);
    expect(await planner.enqueueDueAlerts(organizationId, now)).toBe(0);
    expect(await app.withTenant(organizationId, tx =>
      tx.emailOutbox.count()
    )).toBe(101);
  });

  it("fails closed without an encryption key and rolls back all candidate alerts", async () => {
    await ticket({
      firstResponseDueAt: new Date(now.getTime() + 10 * 60000),
    });
    delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    await expect(
      new SlaEmailPlanner(app).enqueueDueAlerts(organizationId, now)
    ).rejects.toThrow("EMAIL_OUTBOX_ENCRYPTION_UNAVAILABLE");
    expect(await app.withTenant(organizationId, tx => tx.emailOutbox.count()))
      .toBe(0);
  });
});

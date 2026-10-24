import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";

describe("internal TicketSatisfactionSurvey RENEW_EXPIRED_TOKEN restore policy", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let backups: BackupService;
  let root: string;

  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }

    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-csat-"));
    backups = new BackupService(
      runtime,
      new BackupStore({
        directory: root,
        key: randomBytes(32),
        maxBytes: options.maxBytes,
      }),
      options
    );
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function identity(name: string) {
    const organization = await owner.organization.create({
      data: { name, slug: randomUUID() },
    });
    const email = `restore-csat-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore CSAT operator",
        passwordHash: "synthetic-restore-csat-hash",
      },
    });
    await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    return { organization, user };
  }

  async function ticket(
    organizationId: string,
    userId: string,
    protocol: string,
    subject: string
  ) {
    return owner.ticket.create({
      data: {
        organizationId,
        protocol,
        subject,
        status: "RESOLVED",
        resolvedAt: new Date("2026-10-20T12:00:00.000Z"),
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  function tokenHash(seed: string) {
    return createHash("sha256").update(seed).digest("hex");
  }

  it("restores an unanswered survey without resurrecting its bearer token and leaves another tenant untouched", async () => {
    const target = await identity("Restore CSAT target");
    const other = await identity("Restore CSAT other");
    const targetTicket = await ticket(
      target.organization.id,
      target.user.id,
      "2026-010001",
      "Subject from backup"
    );
    const otherTicket = await ticket(
      other.organization.id,
      other.user.id,
      "2026-010001",
      "Other tenant"
    );
    const snapshotHash = tokenHash("snapshot-token");
    const liveHash = tokenHash("live-token");
    const otherHash = tokenHash("other-token");
    const snapshotExpiry = new Date("2026-12-01T00:00:00.000Z");

    const survey = await owner.ticketSatisfactionSurvey.create({
      data: {
        organizationId: target.organization.id,
        ticketId: targetTicket.id,
        tokenHash: snapshotHash,
        expiresAt: snapshotExpiry,
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    const otherSurvey = await owner.ticketSatisfactionSurvey.create({
      data: {
        organizationId: other.organization.id,
        ticketId: otherTicket.id,
        tokenHash: otherHash,
        expiresAt: snapshotExpiry,
        createdBy: other.user.id,
        updatedBy: other.user.id,
      },
    });

    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);
    expect(verified.data.TicketSatisfactionSurvey).toHaveLength(1);
    expect(verified.data.TicketSatisfactionSurvey?.[0]).not.toHaveProperty(
      "tokenHash"
    );

    await owner.ticket.update({
      where: { id: targetTicket.id },
      data: { subject: "Changed after backup" },
    });
    await owner.ticketSatisfactionSurvey.update({
      where: { id: survey.id },
      data: {
        tokenHash: liveHash,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        version: { increment: 1 },
      },
    });

    const restoreStartedAt = Date.now();
    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(
      await owner.ticket.findUniqueOrThrow({ where: { id: targetTicket.id } })
    ).toMatchObject({ subject: "Subject from backup" });

    const restored = await owner.ticketSatisfactionSurvey.findUniqueOrThrow({
      where: { id: survey.id },
    });
    expect(restored).toMatchObject({
      organizationId: target.organization.id,
      ticketId: targetTicket.id,
      rating: null,
      comment: null,
      respondedAt: null,
      version: 1,
    });
    expect(restored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(restored.tokenHash).not.toBe(snapshotHash);
    expect(restored.tokenHash).not.toBe(liveHash);
    expect(restored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(restored.expiresAt.getTime()).toBeGreaterThanOrEqual(
      restoreStartedAt - 1_000
    );

    expect(
      await owner.ticketSatisfactionSurvey.findUniqueOrThrow({
        where: { id: otherSurvey.id },
      })
    ).toMatchObject({
      tokenHash: otherHash,
      expiresAt: snapshotExpiry,
    });
  });

  it("preserves a responded survey while replacing the non-exported token hash", async () => {
    const target = await identity("Restore responded CSAT");
    const targetTicket = await ticket(
      target.organization.id,
      target.user.id,
      "2026-010002",
      "Responded from backup"
    );
    const respondedAt = new Date("2026-10-21T10:15:30.123Z");
    const expiry = new Date("2026-10-30T00:00:00.000Z");
    const snapshotHash = tokenHash("responded-snapshot-token");
    const liveHash = tokenHash("responded-live-token");

    const survey = await owner.ticketSatisfactionSurvey.create({
      data: {
        organizationId: target.organization.id,
        ticketId: targetTicket.id,
        tokenHash: snapshotHash,
        expiresAt: expiry,
        rating: 5,
        comment: "Atendimento resolvido",
        respondedAt,
        createdBy: target.user.id,
        updatedBy: target.user.id,
        version: 4,
      },
    });

    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);

    await owner.ticketSatisfactionSurvey.update({
      where: { id: survey.id },
      data: {
        tokenHash: liveHash,
        rating: 1,
        comment: "Changed after backup",
        respondedAt: new Date("2026-10-22T00:00:00.000Z"),
        version: 5,
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    const restored = await owner.ticketSatisfactionSurvey.findUniqueOrThrow({
      where: { id: survey.id },
    });
    expect(restored).toMatchObject({
      organizationId: target.organization.id,
      ticketId: targetTicket.id,
      rating: 5,
      comment: "Atendimento resolvido",
      respondedAt,
      expiresAt: expiry,
      version: 4,
    });
    expect(restored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(restored.tokenHash).not.toBe(snapshotHash);
    expect(restored.tokenHash).not.toBe(liveHash);
  });

  it("removes a survey created after a backup that contained no survey", async () => {
    const target = await identity("Restore pre-CSAT snapshot");
    const other = await identity("Restore pre-CSAT other");
    const targetTicket = await ticket(
      target.organization.id,
      target.user.id,
      "2026-010003",
      "Ticket before survey"
    );
    const otherTicket = await ticket(
      other.organization.id,
      other.user.id,
      "2026-010003",
      "Other tenant survey"
    );

    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);
    expect(verified.data.TicketSatisfactionSurvey).toEqual([]);

    await owner.ticketSatisfactionSurvey.create({
      data: {
        organizationId: target.organization.id,
        ticketId: targetTicket.id,
        tokenHash: tokenHash("created-after-backup"),
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    const foreign = await owner.ticketSatisfactionSurvey.create({
      data: {
        organizationId: other.organization.id,
        ticketId: otherTicket.id,
        tokenHash: tokenHash("foreign-after-backup"),
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        createdBy: other.user.id,
        updatedBy: other.user.id,
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(
      await owner.ticketSatisfactionSurvey.count({
        where: { organizationId: target.organization.id },
      })
    ).toBe(0);
    expect(
      await owner.ticketSatisfactionSurvey.findUnique({ where: { id: foreign.id } })
    ).not.toBeNull();
  });
});

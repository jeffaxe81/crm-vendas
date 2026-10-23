import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";

describe("internal Ticket/TicketEvent restore graph", () => {
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
    root = await mkdtemp(join(tmpdir(), "axes-restore-ticket-event-"));
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

  it("round-trips Ticket and TicketEvent under the tenant maintenance lock", async () => {
    const organization = await owner.organization.create({
      data: { name: "Restore Ticket test", slug: randomUUID() },
    });
    const email = `restore-ticket-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore Ticket operator",
        passwordHash: "synthetic-ticket-restore-hash",
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

    const ticket = await owner.ticket.create({
      data: {
        organizationId: organization.id,
        protocol: "2026-009001",
        subject: "Subject from backup",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const event = await owner.ticketEvent.create({
      data: {
        organizationId: organization.id,
        ticketId: ticket.id,
        type: "COMMENT",
        authorUserId: user.id,
        body: "Event from backup",
      },
    });

    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);

    await owner.ticket.update({
      where: { id: ticket.id },
      data: { subject: "Changed after backup" },
    });
    await owner.ticketEvent.delete({ where: { id: event.id } });

    await runtime.withMaintenance(
      organization.id,
      tx => restoreTenantSnapshot(tx, organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(
      await owner.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    ).toMatchObject({
      organizationId: organization.id,
      subject: "Subject from backup",
    });
    expect(
      await owner.ticketEvent.findUniqueOrThrow({ where: { id: event.id } })
    ).toMatchObject({
      organizationId: organization.id,
      ticketId: ticket.id,
      body: "Event from backup",
    });
  });
  it.each(["survey", "outbox", "counter"] as const)(
    "refuses direct Ticket replacement with live %s policy data",
    async dependent => {
      const organization = await owner.organization.create({
        data: { name: "Ticket dependency safety", slug: randomUUID() },
      });
      const email = `dependency-${randomUUID()}@example.test`;
      const user = await owner.user.create({
        data: {
          email,
          emailNormalized: email,
          displayName: "Ticket safety operator",
          passwordHash: "synthetic",
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
      const ticket = await owner.ticket.create({
        data: {
          organizationId: organization.id,
          protocol: "2026-009001",
          subject: "Preserve while dependent exists",
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      const backup = await backups.create(organization.id, user.id, "MANUAL");
      const verified = await backups.verify(organization.id, backup.id);

      if (dependent === "survey") {
        await owner.ticketSatisfactionSurvey.create({
          data: {
            organizationId: organization.id,
            ticketId: ticket.id,
            tokenHash: randomBytes(32).toString("hex"),
            expiresAt: new Date("2026-12-01T00:00:00Z"),
            createdBy: user.id,
            updatedBy: user.id,
          },
        });
      } else if (dependent === "outbox") {
        await owner.emailOutbox.create({
          data: {
            organizationId: organization.id,
            ticketId: ticket.id,
            idempotencyHash: randomBytes(32).toString("hex"),
            purpose: "SATISFACTION_REQUEST",
            encryptedEmail: "synthetic-private-ciphertext",
          },
        });
      } else {
        await owner.ticketProtocolCounter.create({
          data: {
            organizationId: organization.id,
            year: 2026,
            lastValue: 9001,
          },
        });
      }

      await expect(
        runtime.withMaintenance(
          organization.id,
          tx => restoreTenantSnapshot(tx, organization.id, verified.data),
          { isolationLevel: "RepeatableRead", timeout: 60_000 }
        )
      ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");
      expect(
        await owner.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
      ).toMatchObject({ subject: "Preserve while dependent exists" });
    }
  );

});

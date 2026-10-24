import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";

describe("internal TicketProtocolCounter MERGE_HIGH_WATER restore policy", () => {
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
    root = await mkdtemp(join(tmpdir(), "axes-restore-protocol-counter-"));
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
    const email = `protocol-counter-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Protocol counter restore operator",
        passwordHash: "synthetic-protocol-counter-hash",
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

  it("never lowers a live protocol high-water value and leaves another tenant untouched", async () => {
    const target = await identity("Protocol high-water target");
    const other = await identity("Protocol high-water other tenant");

    await owner.ticketProtocolCounter.create({
      data: {
        organizationId: target.organization.id,
        year: 2026,
        lastValue: 10,
      },
    });
    await owner.ticketProtocolCounter.create({
      data: {
        organizationId: other.organization.id,
        year: 2026,
        lastValue: 77,
      },
    });

    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);

    await owner.ticketProtocolCounter.update({
      where: {
        organizationId_year: {
          organizationId: target.organization.id,
          year: 2026,
        },
      },
      data: { lastValue: 29 },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    await expect(
      owner.ticketProtocolCounter.findUniqueOrThrow({
        where: {
          organizationId_year: {
            organizationId: target.organization.id,
            year: 2026,
          },
        },
      })
    ).resolves.toMatchObject({ lastValue: 29 });

    await expect(
      owner.ticketProtocolCounter.findUniqueOrThrow({
        where: {
          organizationId_year: {
            organizationId: other.organization.id,
            year: 2026,
          },
        },
      })
    ).resolves.toMatchObject({ lastValue: 77 });
  });

  it("restores a higher historical counter when the live row is absent", async () => {
    const target = await identity("Protocol historical high-water");

    await owner.ticketProtocolCounter.create({
      data: {
        organizationId: target.organization.id,
        year: 2025,
        lastValue: 43,
      },
    });

    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);

    await owner.ticketProtocolCounter.delete({
      where: {
        organizationId_year: {
          organizationId: target.organization.id,
          year: 2025,
        },
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    await expect(
      owner.ticketProtocolCounter.findUniqueOrThrow({
        where: {
          organizationId_year: {
            organizationId: target.organization.id,
            year: 2025,
          },
        },
      })
    ).resolves.toMatchObject({ lastValue: 43 });
  });
});

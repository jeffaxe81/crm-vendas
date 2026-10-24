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

  it.each([10, 43])(
    "restores the backup high-water when the live counter is %s and remains idempotent",
    async liveValue => {
      const target = await identity("Protocol snapshot high-water");
      const key = { organizationId: target.organization.id, year: 2026 };
      await owner.ticketProtocolCounter.create({
        data: { ...key, lastValue: 43 },
      });
      const backup = await backups.create(
        target.organization.id,
        target.user.id,
        "MANUAL"
      );
      const verified = await backups.verify(target.organization.id, backup.id);
      await owner.ticketProtocolCounter.update({
        where: { organizationId_year: key },
        data: { lastValue: liveValue },
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        await runtime.withMaintenance(
          target.organization.id,
          tx =>
            restoreTenantSnapshot(tx, target.organization.id, verified.data),
          { isolationLevel: "RepeatableRead", timeout: 60_000 }
        );
        await expect(
          owner.ticketProtocolCounter.findUniqueOrThrow({
            where: { organizationId_year: key },
          })
        ).resolves.toMatchObject({ lastValue: 43 });
      }
    }
  );

  it("preserves a live-only year when restoring an older snapshot", async () => {
    const target = await identity("Protocol live-only year");
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
    await owner.ticketProtocolCounter.create({
      data: {
        organizationId: target.organization.id,
        year: 2026,
        lastValue: 29,
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    await expect(
      owner.ticketProtocolCounter.findMany({
        where: { organizationId: target.organization.id },
        select: { year: true, lastValue: true },
        orderBy: { year: "asc" },
      })
    ).resolves.toEqual([
      { year: 2025, lastValue: 43 },
      { year: 2026, lastValue: 29 },
    ]);
  });

  it("rolls back the counter merge and business graph together on a late failure", async () => {
    const target = await identity("Protocol rollback");
    const key = { organizationId: target.organization.id, year: 2026 };
    await owner.ticketProtocolCounter.create({
      data: { ...key, lastValue: 43 },
    });
    const company = await owner.company.create({
      data: {
        organizationId: target.organization.id,
        legalName: "Company in snapshot",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);
    await owner.ticketProtocolCounter.update({
      where: { organizationId_year: key },
      data: { lastValue: 10 },
    });
    const liveCompany = await owner.company.update({
      where: { id: company.id },
      data: { legalName: "Company after snapshot" },
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        async tx => {
          await restoreTenantSnapshot(
            tx,
            target.organization.id,
            verified.data
          );
          expect(
            await tx.ticketProtocolCounter.findUniqueOrThrow({
              where: { organizationId_year: key },
            })
          ).toMatchObject({ lastValue: 43 });
          expect(
            await tx.company.findUniqueOrThrow({ where: { id: company.id } })
          ).toMatchObject({ legalName: "Company in snapshot" });
          throw Error("SYNTHETIC_FAILURE_AFTER_RESTORE");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("SYNTHETIC_FAILURE_AFTER_RESTORE");

    await expect(
      owner.ticketProtocolCounter.findUniqueOrThrow({
        where: { organizationId_year: key },
      })
    ).resolves.toMatchObject({ lastValue: 10 });
    await expect(
      owner.company.findUniqueOrThrow({ where: { id: company.id } })
    ).resolves.toEqual(liveCompany);
  });
});

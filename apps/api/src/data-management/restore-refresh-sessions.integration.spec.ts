import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";

describe("internal RefreshSession PRESERVE_AND_REVOKE restore policy", () => {
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
    root = await mkdtemp(join(tmpdir(), "axes-restore-refresh-session-"));
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
    const email = `restore-session-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore session operator",
        passwordHash: "synthetic-refresh-session-hash",
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

  it(
    "preserves session rows, revokes only active sessions in the restored tenant, and leaves another tenant untouched",
    async () => {
      const target = await identity("Restore refresh target");
      const other = await identity("Restore refresh other");
      const previouslyRevokedAt = new Date("2026-10-20T12:00:00.000Z");

      const active = await owner.refreshSession.create({
        data: {
          organizationId: target.organization.id,
          userId: target.user.id,
          tokenHash: randomUUID(),
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        },
      });
      const alreadyRevoked = await owner.refreshSession.create({
        data: {
          organizationId: target.organization.id,
          userId: target.user.id,
          tokenHash: randomUUID(),
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
          revokedAt: previouslyRevokedAt,
        },
      });
      const foreign = await owner.refreshSession.create({
        data: {
          organizationId: other.organization.id,
          userId: other.user.id,
          tokenHash: randomUUID(),
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        },
      });

      const backup = await backups.create(
        target.organization.id,
        target.user.id,
        "MANUAL"
      );
      const verified = await backups.verify(target.organization.id, backup.id);

      await runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(tx, target.organization.id, verified.data),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      );

      const [activeAfter, revokedAfter, foreignAfter] = await Promise.all([
        owner.refreshSession.findUniqueOrThrow({ where: { id: active.id } }),
        owner.refreshSession.findUniqueOrThrow({
          where: { id: alreadyRevoked.id },
        }),
        owner.refreshSession.findUniqueOrThrow({ where: { id: foreign.id } }),
      ]);

      expect(activeAfter.revokedAt).not.toBeNull();
      expect(revokedAfter.revokedAt).toEqual(previouslyRevokedAt);
      expect(foreignAfter.revokedAt).toBeNull();
      expect(
        await owner.refreshSession.count({
          where: { organizationId: target.organization.id },
        })
      ).toBe(2);
    }
  );
});

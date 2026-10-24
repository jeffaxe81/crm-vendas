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

  it("preserves session metadata and revokes only unrevoked sessions in the restored tenant", async () => {
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
      tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
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
    expect(activeAfter).toEqual({ ...active, revokedAt: expect.any(Date) });
    expect(revokedAfter).toEqual(alreadyRevoked);
    expect(foreignAfter).toEqual(foreign);
    expect(revokedAfter.revokedAt).toEqual(previouslyRevokedAt);
    expect(foreignAfter.revokedAt).toBeNull();
    expect(
      await owner.refreshSession.count({
        where: { organizationId: target.organization.id },
      })
    ).toBe(2);
  });

  it("revokes a session created after backup without changing the same user's other tenant, even on replay", async () => {
    const target = await identity("Shared user restore target");
    const other = await identity("Shared user other tenant");
    await owner.organizationMembership.create({
      data: {
        organizationId: other.organization.id,
        userId: target.user.id,
        role: "VIEWER",
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);
    expect(verified.data.RefreshSession).toBeUndefined();
    const active = await owner.refreshSession.create({
      data: {
        organizationId: target.organization.id,
        userId: target.user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        lastUsedAt: new Date("2026-10-20T12:00:00.000Z"),
      },
    });
    const foreign = await owner.refreshSession.create({
      data: {
        organizationId: other.organization.id,
        userId: target.user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });

    let firstRevocation: Date | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      await runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      );
      const after = await owner.refreshSession.findUniqueOrThrow({
        where: { id: active.id },
      });
      expect(after.revokedAt).toBeInstanceOf(Date);
      if (attempt === 0) firstRevocation = after.revokedAt;
      expect(after).toEqual({ ...active, revokedAt: firstRevocation });
      await expect(
        owner.refreshSession.findUniqueOrThrow({ where: { id: foreign.id } })
      ).resolves.toEqual(foreign);
    }
  });

  it("rolls back session revocation and business restoration together after a late failure", async () => {
    const target = await identity("Session rollback target");
    const company = await owner.company.create({
      data: {
        organizationId: target.organization.id,
        legalName: "Company in backup",
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
    const liveCompany = await owner.company.update({
      where: { id: company.id },
      data: { legalName: "Company after backup" },
    });
    const session = await owner.refreshSession.create({
      data: {
        organizationId: target.organization.id,
        userId: target.user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
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
            await tx.refreshSession.findUniqueOrThrow({
              where: { id: session.id },
            })
          ).toMatchObject({ revokedAt: expect.any(Date) });
          expect(
            await tx.company.findUniqueOrThrow({ where: { id: company.id } })
          ).toMatchObject({ legalName: "Company in backup" });
          throw Error("SYNTHETIC_FAILURE_AFTER_SESSION_REVOCATION");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("SYNTHETIC_FAILURE_AFTER_SESSION_REVOCATION");

    await expect(
      owner.refreshSession.findUniqueOrThrow({ where: { id: session.id } })
    ).resolves.toEqual(session);
    await expect(
      owner.company.findUniqueOrThrow({ where: { id: company.id } })
    ).resolves.toEqual(liveCompany);
  });
});

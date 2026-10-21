import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { preflightRestoreExecution } from "./restore-locked-preflight";

describe("restore locked preflight", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
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
    root = await mkdtemp(join(tmpdir(), "axes-restore-locked-preflight-"));
    store = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    backups = new BackupService(runtime, store, options);
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

  async function fixture() {
    const organization = await owner.organization.create({
      data: { name: "Restore locked preflight", slug: randomUUID() },
    });
    const email = `restore-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore Superuser",
        passwordHash: "synthetic-preflight-hash",
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
    await owner.company.create({
      data: {
        organizationId: organization.id,
        legalName: "Locked state",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);
    return { organization, user, verified };
  }

  it("requires the exclusive maintenance transaction", async () => {
    const { organization, verified } = await fixture();

    await expect(
      runtime.withTenant(
        organization.id,
        tx =>
          preflightRestoreExecution(
            tx,
            organization.id,
            verified,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");
  });

  it("revalidates the target and fingerprints the locked current state", async () => {
    const { organization, verified } = await fixture();

    const result = await runtime.withMaintenance(
      organization.id,
      tx =>
        preflightRestoreExecution(
          tx,
          organization.id,
          verified,
          options.maxBytes
        ),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(result.targetChecksum).toBe(verified.manifest.checksum);
    expect(result.currentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.targetCounts).toEqual(verified.manifest.counts);
    expect(result.currentCounts.Company).toBe(1);
  });

  it("blocks restore when an unsupported model gained live data", async () => {
    const { organization, user, verified } = await fixture();
    const ticket = await owner.ticket.create({
      data: {
        organizationId: organization.id,
        protocol: "2026-000101",
        subject: "Do not discard",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    await expect(
      runtime.withMaintenance(
        organization.id,
        tx =>
          preflightRestoreExecution(
            tx,
            organization.id,
            verified,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");

    expect(
      await owner.ticket.findUnique({ where: { id: ticket.id } })
    ).not.toBeNull();
  });

  it("blocks unsupported rows existing only in target", async () => {
    const { organization, user } = await fixture();
    const ticket = await owner.ticket.create({
      data: {
        organizationId: organization.id,
        protocol: "2026-000102",
        subject: "Historical ticket",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);
    await owner.ticket.delete({ where: { id: ticket.id } });

    await expect(
      runtime.withMaintenance(
        organization.id,
        tx =>
          preflightRestoreExecution(
            tx,
            organization.id,
            verified,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");

    expect(
      await owner.ticket.count({ where: { organizationId: organization.id } })
    ).toBe(0);
  });

  it("fails closed when a referenced live identity changed after backup", async () => {
    const { organization, user, verified } = await fixture();

    await owner.user.update({
      where: { id: user.id },
      data: {
        email: "changed-locked-identity@example.test",
        emailNormalized: "changed-locked-identity@example.test",
      },
    });

    await expect(
      runtime.withMaintenance(
        organization.id,
        tx =>
          preflightRestoreExecution(
            tx,
            organization.id,
            verified,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_USER_IDENTITY_CHANGED");
  });

  it("fails closed on dangling target references under the maintenance lock", async () => {
    const { organization, user, verified } = await fixture();
    const broken = {
      ...verified,
      data: structuredClone(verified.data),
    };
    broken.data.RelationshipEntry = [
      {
        id: randomUUID(),
        organizationId: organization.id,
        companyId: randomUUID(),
        contactId: null,
        authorUserId: user.id,
      },
    ];

    await expect(
      runtime.withMaintenance(
        organization.id,
        tx =>
          preflightRestoreExecution(
            tx,
            organization.id,
            broken,
            options.maxBytes
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("BACKUP_REFERENCES_INVALID");
  });
});

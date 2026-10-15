import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";

describe("transactional tenant restore executor", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let backups: BackupService;
  let root: string;

  const passwords = new PasswordService();
  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }

    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-executor-"));
    const store = new BackupStore({
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

  async function fixture(empty = false) {
    const organization = await owner.organization.create({
      data: { name: "Executor safety test", slug: randomUUID() },
    });
    const email = `restore-safety-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore safety operator",
        passwordHash: "synthetic-restore-safety-hash",
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
    if (!empty) {
      await owner.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Current company",
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    }
    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);
    return { organization, user, verified };
  }

  async function companies(organizationId: string) {
    return runtime.withTenant(organizationId, tx =>
      tx.company.findMany({ where: { organizationId }, orderBy: { id: "asc" } })
    );
  }

  it("restores tenant business data while preserving live user credentials", async () => {
    const organization = await owner.organization.create({
      data: { name: "Restore Executor", slug: randomUUID() },
    });
    const user = await owner.user.create({
      data: {
        email: `restore-${randomUUID()}@example.test`,
        emailNormalized: `restore-${randomUUID()}@example.test`,
        displayName: "Restore Operator",
        passwordHash: await passwords.hash("synthetic-original-password"),
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

    const company = await owner.company.create({
      data: {
        organizationId: organization.id,
        legalName: "Company from backup",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);

    const changedHash = await passwords.hash("synthetic-live-password");
    await owner.company.update({
      where: { id: company.id },
      data: { legalName: "Changed after backup" },
    });
    await owner.user.update({
      where: { id: user.id },
      data: { passwordHash: changedHash },
    });

    await runtime.withMaintenance(
      organization.id,
      tx => restoreTenantSnapshot(tx, organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    const restored = await runtime.withTenant(organization.id, async tx => ({
      company: await tx.company.findUniqueOrThrow({
        where: { id: company.id },
      }),
      user: await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      }),
    }));

    expect(restored.company.legalName).toBe("Company from backup");
    expect(restored.user.passwordHash).toBe(changedHash);
  });

  it("rejects another tenant's empty backup without deleting the current tenant", async () => {
    const target = await fixture();
    const source = await fixture(true);
    const before = await companies(target.organization.id);

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            source.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_TARGET_INVALID");

    expect(await companies(target.organization.id)).toEqual(before);
    expect(await companies(source.organization.id)).toEqual([]);
  });

  it("restores an empty same-tenant backup and leaves the other tenant unchanged", async () => {
    const target = await fixture(true);
    const other = await fixture();
    const otherBefore = await companies(other.organization.id);
    await owner.company.create({
      data: {
        organizationId: target.organization.id,
        legalName: "Created after the empty snapshot",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(await companies(target.organization.id)).toEqual([]);
    expect(await companies(other.organization.id)).toEqual(otherBefore);
  });

  it("rolls back deletion when replacement violates a database constraint", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company!.push({ ...broken.Company![0]! });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow();

    expect(await companies(target.organization.id)).toEqual(before);
  });

  it("fails closed for a non-empty unsupported replacement policy", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);
    await owner.tag.create({
      data: {
        organizationId: target.organization.id,
        name: "Unsupported restore category",
        normalizedName: "unsupported-restore-category",
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");

    expect(await companies(target.organization.id)).toEqual(before);
    expect(
      await owner.tag.count({
        where: { organizationId: target.organization.id },
      })
    ).toBe(1);
  });

  it("rejects a transaction without the exclusive maintenance context", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);

    await expect(
      runtime.withTenant(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");

    expect(await companies(target.organization.id)).toEqual(before);
  });

  it("rejects maintenance at ReadCommitted before modifying data", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "ReadCommitted", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");

    expect(await companies(target.organization.id)).toEqual(before);
  });
});

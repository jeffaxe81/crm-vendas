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
    const company = await owner.company.create({
      data: {
        organizationId: organization.id,
        legalName: "Company from backup",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const backup = await backups.create(
      organization.id,
      user.id,
      "MANUAL"
    );
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

    const restored = await runtime.withTenant(
      organization.id,
      async tx => ({
        company: await tx.company.findUniqueOrThrow({
          where: { id: company.id },
        }),
        user: await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        }),
      })
    );

    expect(restored.company.legalName).toBe("Company from backup");
    expect(restored.user.passwordHash).toBe(changedHash);
  });
});

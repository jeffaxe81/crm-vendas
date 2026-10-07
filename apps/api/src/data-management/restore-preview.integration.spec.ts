import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import {
  DataPreviewService,
  OPERATION_PREVIEW_TTL_MS,
} from "./data-preview.service";

describe("session-bound restore previews", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let backups: BackupService;
  let previews: DataPreviewService;
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
    root = await mkdtemp(join(tmpdir(), "axes-restore-preview-"));
    store = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    backups = new BackupService(runtime, store, options);
    previews = new DataPreviewService(runtime, backups, options);
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
      data: { name: "Restore Preview A", slug: "restore-preview-a" },
    });
    const otherOrganization = await owner.organization.create({
      data: { name: "Restore Preview B", slug: "restore-preview-b" },
    });
    const superuser = await owner.user.create({
      data: {
        email: "preview-super@example.test",
        emailNormalized: "preview-super@example.test",
        displayName: "Preview Superuser",
        passwordHash: "synthetic",
      },
    });
    const admin = await owner.user.create({
      data: {
        email: "preview-admin@example.test",
        emailNormalized: "preview-admin@example.test",
        displayName: "Preview Admin",
        passwordHash: "synthetic",
      },
    });
    const membership = await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: superuser.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    const otherMembership = await owner.organizationMembership.create({
      data: {
        organizationId: otherOrganization.id,
        userId: superuser.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    const adminMembership = await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        role: "ADMIN",
      },
    });
    const session = await owner.refreshSession.create({
      data: {
        organizationId: organization.id,
        userId: superuser.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const otherSession = await owner.refreshSession.create({
      data: {
        organizationId: otherOrganization.id,
        userId: superuser.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const adminSession = await owner.refreshSession.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await owner.company.create({
      data: {
        organizationId: organization.id,
        legalName: "Current company",
        createdBy: superuser.id,
        updatedBy: superuser.id,
      },
    });
    await owner.company.create({
      data: {
        organizationId: otherOrganization.id,
        legalName: "Other company",
        createdBy: superuser.id,
        updatedBy: superuser.id,
      },
    });

    const principal: AuthenticatedPrincipal = {
      userId: superuser.id,
      organizationId: organization.id,
      membershipId: membership.id,
      role: "ADMIN",
      sessionId: session.id,
      permissions: [],
      authMethod: "session",
      isSuperuser: true,
    };

    return {
      organization,
      otherOrganization,
      superuser,
      admin,
      membership,
      otherMembership,
      adminMembership,
      session,
      otherSession,
      adminSession,
      principal,
    };
  }

  it("persists a five-minute restore preview bound to tenant, actor, session, checksum and current data", async () => {
    const { organization, superuser, session, principal } = await fixture();
    const backup = await backups.create(
      organization.id,
      superuser.id,
      "MANUAL"
    );
    const before = Date.now();

    const preview = await previews.previewRestore(principal, backup.id);

    expect(preview.kind).toBe("RESTORE");
    expect(preview.organizationId).toBe(organization.id);
    expect(preview.actorUserId).toBe(superuser.id);
    expect(preview.targetBackupId).toBe(backup.id);
    expect(preview.targetChecksum).toBe(backup.checksum);
    expect(preview.currentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.targetCounts).toEqual(backup.counts);
    expect(preview.currentCounts.Company).toBe(1);
    expect(Date.parse(preview.expiresAt) - before).toBeGreaterThanOrEqual(
      OPERATION_PREVIEW_TTL_MS - 5_000
    );
    expect(Date.parse(preview.expiresAt) - before).toBeLessThanOrEqual(
      OPERATION_PREVIEW_TTL_MS + 5_000
    );

    const stored = await runtime.withTenant(organization.id, tx =>
      tx.operationPreview.findUniqueOrThrow({ where: { id: preview.id } })
    );
    expect(stored.sessionId).toBe(session.id);
    expect(stored.targetChecksum).toBe(backup.checksum);
    expect(stored.currentFingerprint).toBe(preview.currentFingerprint);
    expect(stored.consumedAt).toBeNull();

    const audit = await runtime.withTenant(organization.id, tx =>
      tx.auditLog.findFirst({
        where: {
          entityId: preview.id,
          action: "restore.preview_created",
        },
      })
    );
    expect(audit).not.toBeNull();
  });

  it("changes the current-data fingerprint when tenant business data changes", async () => {
    const { organization, superuser, principal } = await fixture();
    const backup = await backups.create(
      organization.id,
      superuser.id,
      "MANUAL"
    );
    const first = await previews.previewRestore(principal, backup.id);

    await owner.company.updateMany({
      where: { organizationId: organization.id },
      data: { legalName: "Changed after preview" },
    });

    const second = await previews.previewRestore(principal, backup.id);

    expect(second.currentFingerprint).not.toBe(first.currentFingerprint);
    expect(second.targetChecksum).toBe(first.targetChecksum);
  });

  it("rejects ordinary administrators, api keys and revoked sessions", async () => {
    const {
      organization,
      superuser,
      admin,
      adminMembership,
      adminSession,
      session,
      principal,
    } = await fixture();
    const backup = await backups.create(
      organization.id,
      superuser.id,
      "MANUAL"
    );

    const adminPrincipal: AuthenticatedPrincipal = {
      userId: admin.id,
      organizationId: organization.id,
      membershipId: adminMembership.id,
      role: "ADMIN",
      sessionId: adminSession.id,
      permissions: [],
      authMethod: "session",
      isSuperuser: false,
    };
    await expect(
      previews.previewRestore(adminPrincipal, backup.id)
    ).rejects.toThrow("OPERATION_PREVIEW_FORBIDDEN");

    const apiPrincipal: AuthenticatedPrincipal = {
      ...principal,
      authMethod: "api_key",
      sessionId: "api-key:synthetic",
      apiKeyId: randomUUID(),
    };
    await expect(
      previews.previewRestore(apiPrincipal, backup.id)
    ).rejects.toThrow("OPERATION_PREVIEW_FORBIDDEN");

    await owner.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await expect(previews.previewRestore(principal, backup.id)).rejects.toThrow(
      "OPERATION_PREVIEW_FORBIDDEN"
    );
  });

  it("does not expose another tenant backup or preview rows through RLS", async () => {
    const {
      organization,
      otherOrganization,
      superuser,
      otherMembership,
      otherSession,
      principal,
    } = await fixture();
    const otherBackup = await backups.create(
      otherOrganization.id,
      superuser.id,
      "MANUAL"
    );

    await expect(
      previews.previewRestore(principal, otherBackup.id)
    ).rejects.toThrow("BACKUP_NOT_FOUND");

    const localBackup = await backups.create(
      organization.id,
      superuser.id,
      "MANUAL"
    );
    const localPreview = await previews.previewRestore(
      principal,
      localBackup.id
    );

    expect(
      await runtime.withTenant(otherOrganization.id, tx =>
        tx.operationPreview.findMany({
          where: { id: localPreview.id },
          select: { id: true },
        })
      )
    ).toEqual([]);

    const otherPrincipal: AuthenticatedPrincipal = {
      ...principal,
      organizationId: otherOrganization.id,
      membershipId: otherMembership.id,
      sessionId: otherSession.id,
    };
    const otherPreview = await previews.previewRestore(
      otherPrincipal,
      otherBackup.id
    );
    expect(otherPreview.organizationId).toBe(otherOrganization.id);
  });
});

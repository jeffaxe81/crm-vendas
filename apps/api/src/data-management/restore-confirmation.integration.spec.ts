import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PasswordService } from "../auth/password.service";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { DataPreviewService } from "./data-preview.service";
import {
  consumeRestoreConfirmation,
  RESTORE_CONFIRMATION_PHRASE,
} from "./restore-confirmation";

describe("restore confirmation is session-bound and transactional", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let backups: BackupService;
  let previews: DataPreviewService;
  let root: string;

  const passwords = new PasswordService();
  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };
  const pass = "synthetic-restore-password-123!";

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }

    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-confirm-"));
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
      await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function fixture() {
    const org = await owner.organization.create({
      data: { name: "Restore Confirmation", slug: randomUUID() },
    });
    const email = `restore-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore Superuser",
        passwordHash: await passwords.hash(pass),
      },
    });
    const membership = await owner.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    const session = await owner.refreshSession.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await owner.company.create({
      data: {
        organizationId: org.id,
        legalName: "Before restore",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const principal: AuthenticatedPrincipal = {
      userId: user.id,
      organizationId: org.id,
      membershipId: membership.id,
      sessionId: session.id,
      role: "ADMIN",
      permissions: [],
      authMethod: "session",
      isSuperuser: true,
    };
    const backup = await backups.create(org.id, user.id, "MANUAL");
    const verified = await backups.verify(org.id, backup.id);
    const preview = await previews.previewRestore(principal, backup.id);
    const proof = {
      previewId: preview.id,
      password: pass,
      confirmation: RESTORE_CONFIRMATION_PHRASE,
    };
    const run = (
      input = proof,
      actor = principal,
      transaction = true
    ) => {
      const action = (tx: Prisma.TransactionClient) =>
        consumeRestoreConfirmation(
          tx,
          actor,
          input,
          verified,
          passwords,
          options.maxBytes
        );
      const settings = {
        isolationLevel: "RepeatableRead" as const,
        timeout: 60_000,
      };
      return transaction
        ? runtime.withMaintenance(org.id, action, settings)
        : runtime.withTenant(org.id, action, settings);
    };
    return { org, user, principal, backup, verified, preview, proof, run };
  }

  it("consumes exactly once with audit under the restricted role", async () => {
    const { org, preview, run } = await fixture();
    await run();
    const state = await runtime.withTenant(org.id, async tx => ({
      preview: await tx.operationPreview.findUniqueOrThrow({
        where: { id: preview.id },
      }),
      audit: await tx.auditLog.findFirst({
        where: {
          entityId: preview.id,
          action: "restore.confirmation_consumed",
        },
      }),
    }));
    expect(state.preview.consumedAt).not.toBeNull();
    expect(state.audit).not.toBeNull();
    await expect(run()).rejects.toThrow("RESTORE_CONFIRMATION_INVALID");
  });

  it("rejects wrong password, altered phrase and API keys without consumption", async () => {
    const { org, principal, preview, proof, run } = await fixture();
    await expect(run({ ...proof, password: "wrong" })).rejects.toThrow(
      "RESTORE_CONFIRMATION_INVALID"
    );
    await expect(run({ ...proof, confirmation: "RESTORE" })).rejects.toThrow(
      "RESTORE_CONFIRMATION_INVALID"
    );
    await expect(
      run(proof, { ...principal, authMethod: "api_key" })
    ).rejects.toThrow("RESTORE_FORBIDDEN");
    const result = await runtime.withTenant(org.id, tx =>
      tx.operationPreview.findUniqueOrThrow({ where: { id: preview.id } })
    );
    expect(result.consumedAt).toBeNull();
  });

  it("rejects a changed tenant snapshot, revoked session and wrong transaction", async () => {
    const { org, principal, proof, run } = await fixture();

    await expect(run(proof, principal, false)).rejects.toThrow(
      "RESTORE_MAINTENANCE_REQUIRED"
    );
    await owner.company.updateMany({
      where: { organizationId: org.id },
      data: { legalName: "Modified after preview" },
    });
    await expect(run()).rejects.toThrow("RESTORE_PREVIEW_STALE");

    await owner.refreshSession.update({
      where: { id: principal.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(run()).rejects.toThrow("RESTORE_CONFIRMATION_INVALID");
  });

  it("rolls back confirmation when the enclosing transaction fails", async () => {
    const { org, preview, principal, proof, verified } = await fixture();
    await expect(
      runtime.withMaintenance(
        org.id,
        async tx => {
          await consumeRestoreConfirmation(
            tx,
            principal,
            proof,
            verified,
            passwords,
            options.maxBytes
          );
          throw Error("SYNTHETIC_RESTORE_ROLLBACK");
        },
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("SYNTHETIC_RESTORE_ROLLBACK");
    const state = await runtime.withTenant(org.id, async tx => ({
      preview: await tx.operationPreview.findUniqueOrThrow({
        where: { id: preview.id },
      }),
      audits: await tx.auditLog.count({
        where: {
          entityId: preview.id,
          action: "restore.confirmation_consumed",
        },
      }),
    }));
    expect(state.preview.consumedAt).toBeNull();
    expect(state.audits).toBe(0);
  });
});

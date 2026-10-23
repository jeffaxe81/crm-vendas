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

  it("rejects a backup revoked after verification without touching tenant data", async () => {
    const { organization, verified } = await fixture();

    await owner.backupRecord.update({
      where: { id: verified.record.id },
      data: { state: "FAILED" },
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
    ).rejects.toThrow("RESTORE_TARGET_INVALID");

    expect(
      await owner.company.count({ where: { organizationId: organization.id } })
    ).toBe(1);
  });

  it("rejects a changed catalog checksum after verification", async () => {
    const { organization, verified } = await fixture();

    await owner.backupRecord.update({
      where: { id: verified.record.id },
      data: { checksum: "0".repeat(64) },
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
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
  });

  it("rejects a changed catalog model count after verification", async () => {
    const { organization, verified } = await fixture();

    await owner.backupRecord.update({
      where: { id: verified.record.id },
      data: { counts: { Company: 999 } },
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
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
  });

  it("accepts a supported Ticket that exists only in live state", async () => {
    const { organization, user, verified } = await fixture();
    const ticket = await owner.ticket.create({
      data: {
        organizationId: organization.id,
        protocol: "2026-000101",
        subject: "Protected by the preventive copy",
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
    ).resolves.toMatchObject({
      targetChecksum: verified.manifest.checksum,
      currentCounts: { Ticket: 1 },
      targetCounts: { Ticket: 0 },
    });

    expect(
      await owner.ticket.findUnique({ where: { id: ticket.id } })
    ).not.toBeNull();
  });

  it("accepts a supported Ticket that exists only in the target snapshot", async () => {
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
    ).resolves.toMatchObject({
      targetChecksum: verified.manifest.checksum,
      currentCounts: { Ticket: 0 },
      targetCounts: { Ticket: 1 },
    });
  });

  it.each(["survey", "outbox"] as const)(
    "fails closed when a live Ticket has a preserved %s dependent",
    async dependent => {
      const { organization, user, verified } = await fixture();
      const ticket = await owner.ticket.create({
        data: {
          organizationId: organization.id,
          protocol: "2026-000103",
          subject: "Ticket with protected dependent",
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
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
      } else {
        await owner.emailOutbox.create({
          data: {
            organizationId: organization.id,
            ticketId: ticket.id,
            idempotencyHash: randomBytes(32).toString("hex"),
            purpose: "SATISFACTION_REQUEST",
            encryptedEmail: "synthetic-preflight-ciphertext",
          },
        });
      }

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
    }
  );

  it("fails closed when the target contains a satisfaction survey policy not implemented by restore", async () => {
    const { organization, user } = await fixture();
    const ticket = await owner.ticket.create({
      data: {
        organizationId: organization.id,
        protocol: "2026-000104",
        subject: "Historical ticket with CSAT",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const survey = await owner.ticketSatisfactionSurvey.create({
      data: {
        organizationId: organization.id,
        ticketId: ticket.id,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);
    await owner.ticketSatisfactionSurvey.delete({ where: { id: survey.id } });
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
  });

  it.each([
    ["absent", false],
    ["recreated for same tenant and user", true],
  ] as const)(
    "validates an %s preserved workspace membership before confirmation",
    async (_case, recreate) => {
      const { organization, user } = await fixture();
      const collaboratorEmail = `restore-collaborator-${randomUUID()}@example.test`;
      const collaborator = await owner.user.create({
        data: {
          email: collaboratorEmail,
          emailNormalized: collaboratorEmail,
          displayName: "Historical workspace owner",
          passwordHash: "synthetic",
        },
      });
      const oldMembership = await owner.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: collaborator.id,
          role: "SELLER",
        },
      });
      await owner.$executeRawUnsafe(
        `INSERT INTO "user_workspace_preferences"
          (organization_id, user_id, preferences, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3::jsonb, now(), now())`,
        organization.id,
        collaborator.id,
        '{"theme":"dark"}'
      );

      const backup = await backups.create(organization.id, user.id, "MANUAL");
      const verified = await backups.verify(organization.id, backup.id);

      // The backup still projects the old membership and workspace owner.
      // Removing the live membership must not permit a stale preview to pass.
      await owner.organizationMembership.delete({
        where: { id: oldMembership.id },
      });

      if (recreate) {
        const replacement = await owner.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: collaborator.id,
            role: "SELLER",
          },
        });
        expect(replacement.id).not.toBe(oldMembership.id);
      } else {
        const other = await owner.organization.create({
          data: { name: "Different tenant", slug: randomUUID() },
        });
        await owner.organizationMembership.create({
          data: {
            organizationId: other.id,
            userId: collaborator.id,
            role: "SELLER",
          },
        });
      }

      const preflight = () =>
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
        );

      if (recreate) {
        await expect(preflight()).resolves.toMatchObject({
          targetChecksum: verified.manifest.checksum,
        });
      } else {
        await expect(preflight()).rejects.toThrow(
          "RESTORE_MEMBERSHIP_REFERENCE_MISSING"
        );
      }
      expect(
        await owner.company.count({
          where: { organizationId: organization.id },
        })
      ).toBe(1);
    }
  );

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

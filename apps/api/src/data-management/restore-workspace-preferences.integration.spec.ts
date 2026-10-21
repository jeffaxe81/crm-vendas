import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultWorkspacePreferences } from "@axes/contracts";

import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type { SnapshotData } from "./backup-manifest";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";
import { exportTenantSnapshot } from "./tenant-snapshot";

describe("transactional workspace preference restore", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let backups: BackupService;
  let root: string;

  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };
  const transactionOptions = {
    isolationLevel: "RepeatableRead" as const,
    timeout: 60_000,
  };
  const createdAt = "2026-10-01T12:00:00.123456Z";
  const updatedAt = "2026-10-02T12:00:00.654321Z";
  const workspaceV1 = {
    ...createDefaultWorkspacePreferences(),
    defaultSection: "companies",
    favorites: ["companies", "contacts"],
    homeOrder: ["today", "favorites", "indicators"],
    homeHidden: ["indicators"],
    dashboardHidden: ["undated"],
  };
  // Keep numeric tokens out of JavaScript's Number representation entirely.
  const arbitraryJson =
    '{"nested":{"large":900719925474099312345678901234567890,"fraction":0.123456789012345678901234567890,"items":[true,false,null,"aspas \\\" e ç 漢字"]},"empty":{},"list":[]}';

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-workspace-"));
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

  async function createUser() {
    const email = `workspace-restore-${randomUUID()}@example.test`;
    return owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Synthetic workspace restore user",
        passwordHash: "synthetic-workspace-original-password",
      },
    });
  }

  async function identity() {
    const organization = await owner.organization.create({
      data: { name: "Workspace restore safety", slug: randomUUID() },
    });
    const user = await createUser();
    const membership = await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    return { organization, user, membership };
  }

  async function addMember(organizationId: string) {
    const user = await createUser();
    const membership = await owner.organizationMembership.create({
      data: { organizationId, userId: user.id, role: "SELLER" },
    });
    return { user, membership };
  }

  async function putPreference(
    organizationId: string,
    userId: string,
    json = JSON.stringify(workspaceV1)
  ) {
    // SQL preserves arbitrary JSON numbers and six-digit timestamps in fixtures.
    await owner.$executeRawUnsafe(
      `INSERT INTO user_workspace_preferences
        (organization_id,user_id,preferences,created_at,updated_at)
       VALUES ($1::uuid,$2::uuid,$3::jsonb,$4::timestamptz,$5::timestamptz)
       ON CONFLICT (organization_id,user_id) DO UPDATE
       SET preferences=EXCLUDED.preferences,created_at=EXCLUDED.created_at,
         updated_at=EXCLUDED.updated_at`,
      organizationId,
      userId,
      json,
      createdAt,
      updatedAt
    );
  }

  function rawPreferences(organizationId: string) {
    return owner.$queryRawUnsafe<
      { userId: string; json: string; isSqlNull: boolean }[]
    >(
      `SELECT user_id AS "userId",preferences::text AS json,
         preferences IS NULL AS "isSqlNull"
       FROM user_workspace_preferences WHERE organization_id=$1::uuid
       ORDER BY user_id`,
      organizationId
    );
  }

  async function verifiedBackup(target: Awaited<ReturnType<typeof identity>>) {
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    return backups.verify(target.organization.id, backup.id);
  }

  async function fixture() {
    const target = await identity();
    const member = await addMember(target.organization.id);
    await putPreference(target.organization.id, target.user.id);
    await putPreference(target.organization.id, member.user.id, arbitraryJson);
    const company = await owner.company.create({
      data: {
        organizationId: target.organization.id,
        legalName: "Empresa histórica do workspace",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    return {
      ...target,
      member,
      company,
      verified: await verifiedBackup(target),
    };
  }

  function snapshotInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string
  ) {
    return exportTenantSnapshot(tx, organizationId, options.maxBytes);
  }

  function snapshot(organizationId: string) {
    return runtime.withTenant(
      organizationId,
      tx => snapshotInTransaction(tx, organizationId),
      transactionOptions
    );
  }

  function restore(organizationId: string, data: SnapshotData) {
    return runtime.withMaintenance(
      organizationId,
      tx => restoreTenantSnapshot(tx, organizationId, data),
      transactionOptions
    );
  }

  async function changeLiveState(target: Awaited<ReturnType<typeof fixture>>) {
    await owner.company.update({
      where: { id: target.company.id },
      data: { legalName: "Empresa atual que deve sobreviver à rejeição" },
    });
    await putPreference(
      target.organization.id,
      target.user.id,
      '{"current":"preserve this changed live value"}'
    );
  }

  async function expectRejectedBeforeDeletion(
    organizationId: string,
    data: SnapshotData,
    code: string
  ) {
    const before = await snapshot(organizationId);
    await runtime.withMaintenance(
      organizationId,
      async tx => {
        await expect(
          restoreTenantSnapshot(tx, organizationId, data)
        ).rejects.toMatchObject({ code });
        // Catch inside the same transaction: rollback cannot mask a DELETE.
        expect(await snapshotInTransaction(tx, organizationId)).toEqual(before);
      },
      transactionOptions
    );
    expect(await snapshot(organizationId)).toEqual(before);
  }

  it("round-trips v1 preferences, arbitrary JSONB numbers, JSON null and microseconds for multiple users without changing current security or another tenant", async () => {
    const target = await identity();
    const second = await addMember(target.organization.id);
    const third = await addMember(target.organization.id);
    await putPreference(target.organization.id, target.user.id);
    await putPreference(target.organization.id, second.user.id, arbitraryJson);
    await putPreference(target.organization.id, third.user.id, "null");
    const rawBefore = await rawPreferences(target.organization.id);
    const verified = await verifiedBackup(target);
    const expected = verified.data.UserWorkspacePreference!;
    expect(expected).toHaveLength(3);
    for (const row of expected) {
      expect(row).toMatchObject({ createdAt, updatedAt });
      expect(row.preferences).toBe(
        rawBefore.find(item => item.userId === row.userId)!.json
      );
    }
    expect(
      JSON.parse(
        expected.find(row => row.userId === target.user.id)!
          .preferences as string
      )
    ).toEqual(workspaceV1);
    expect(
      expected.find(row => row.userId === second.user.id)!.preferences
    ).toContain("900719925474099312345678901234567890");
    expect(
      expected.find(row => row.userId === third.user.id)!.preferences
    ).toBe("null");

    const other = await identity();
    await owner.organizationMembership.create({
      data: {
        organizationId: other.organization.id,
        userId: target.user.id,
        role: "VIEWER",
      },
    });
    await putPreference(
      other.organization.id,
      target.user.id,
      '{"otherTenant":true}'
    );
    const otherBefore = await snapshot(other.organization.id);
    for (const user of [target.user, second.user, third.user]) {
      await putPreference(target.organization.id, user.id, '{"changed":true}');
      await owner.user.update({
        where: { id: user.id },
        data: { passwordHash: `current-password-${user.id}` },
      });
    }
    const newer = await addMember(target.organization.id);
    await putPreference(target.organization.id, newer.user.id);
    await owner.organizationMembership.update({
      where: { id: target.membership.id },
      data: {
        role: "VIEWER",
        isSuperuser: false,
        isActive: false,
        tourStatus: "COMPLETED",
        quickSetupCompletedSteps: ["company", "contact"],
      },
    });
    await owner.organizationMembership.update({
      where: { id: second.membership.id },
      data: { role: "MANAGER", isSuperuser: true },
    });
    const currentMemberships = await owner.organizationMembership.findMany({
      where: { organizationId: target.organization.id },
      orderBy: { id: "asc" },
    });

    await restore(target.organization.id, verified.data);

    expect(
      (await snapshot(target.organization.id)).UserWorkspacePreference
    ).toEqual(expected);
    expect(await rawPreferences(target.organization.id)).toEqual(rawBefore);
    expect(rawBefore.every(row => !row.isSqlNull)).toBe(true);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      await owner.organizationMembership.findMany({
        where: { organizationId: target.organization.id },
        orderBy: { id: "asc" },
      })
    ).toEqual(currentMemberships);
    for (const user of [target.user, second.user, third.user]) {
      expect(
        (await owner.user.findUniqueOrThrow({ where: { id: user.id } }))
          .passwordHash
      ).toBe(`current-password-${user.id}`);
    }
  });

  it("removes newer preferences for multiple users when restoring an authentic empty snapshot", async () => {
    const target = await identity();
    const second = await addMember(target.organization.id);
    const verified = await verifiedBackup(target);
    expect(verified.data.UserWorkspacePreference).toEqual([]);
    await putPreference(target.organization.id, target.user.id);
    await putPreference(target.organization.id, second.user.id, arbitraryJson);
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);

    await restore(target.organization.id, verified.data);

    expect(await snapshot(target.organization.id)).toEqual(verified.data);
    expect(await rawPreferences(target.organization.id)).toEqual([]);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  });

  it.each(["absent", "other tenant only"] as const)(
    "rejects an %s current composite membership before deleting changed live data",
    async location => {
      const target = await fixture();
      await owner.organizationMembership.delete({
        where: { id: target.member.membership.id },
      });
      const other = await identity();
      if (location === "other tenant only") {
        await owner.organizationMembership.create({
          data: {
            organizationId: other.organization.id,
            userId: target.member.user.id,
            role: "ADMIN",
          },
        });
        await putPreference(
          other.organization.id,
          target.member.user.id,
          '{"otherTenant":"membership must not qualify"}'
        );
      }
      await changeLiveState(target);
      const otherBefore = await snapshot(other.organization.id);

      await expectRejectedBeforeDeletion(
        target.organization.id,
        target.verified.data,
        "RESTORE_MEMBERSHIP_REFERENCE_MISSING"
      );
      expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    }
  );

  it("accepts a recreated membership with a new ID and preserves its current role and privileges", async () => {
    const target = await fixture();
    await owner.organizationMembership.delete({
      where: { id: target.member.membership.id },
    });
    const currentMembership = await owner.organizationMembership.create({
      data: {
        organizationId: target.organization.id,
        userId: target.member.user.id,
        role: "VIEWER",
        isSuperuser: true,
        isActive: false,
        tourStatus: "COMPLETED",
        quickSetupCompletedSteps: ["company"],
        quickSetupCompletedAt: new Date("2026-10-04T12:00:00Z"),
      },
    });
    expect(currentMembership.id).not.toBe(target.member.membership.id);
    await changeLiveState(target);

    await restore(target.organization.id, target.verified.data);

    const after = await snapshot(target.organization.id);
    expect(after.UserWorkspacePreference).toEqual(
      target.verified.data.UserWorkspacePreference
    );
    expect(after.Company).toEqual(target.verified.data.Company);
    expect(
      await owner.organizationMembership.findUnique({
        where: { id: currentMembership.id },
      })
    ).toEqual(currentMembership);
    expect(
      await owner.organizationMembership.findUnique({
        where: { id: target.member.membership.id },
      })
    ).toBeNull();
  });

  it.each([
    "missing User",
    "missing membership",
    "other tenant membership",
    "other tenant user",
  ] as const)(
    "rejects a snapshot with %s references before any deletion",
    async kind => {
      const target = await fixture();
      const other = await fixture();
      await changeLiveState(target);
      const broken = structuredClone(target.verified.data);
      if (kind === "missing User") {
        broken.User = broken.User!.filter(
          row => row.id !== target.member.user.id
        );
      } else if (kind === "missing membership") {
        broken.OrganizationMembership = broken.OrganizationMembership!.filter(
          row => row.userId !== target.member.user.id
        );
      } else if (kind === "other tenant membership") {
        broken.OrganizationMembership!.find(
          row => row.userId === target.member.user.id
        )!.organizationId = other.organization.id;
      } else {
        broken.UserWorkspacePreference!.find(
          row => row.userId === target.member.user.id
        )!.userId = other.user.id;
      }
      const otherBefore = await snapshot(other.organization.id);

      await expectRejectedBeforeDeletion(
        target.organization.id,
        broken,
        "BACKUP_REFERENCES_INVALID"
      );
      expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    }
  );

  it.each(["missing", "changed"] as const)(
    "preserves the existing %s live-user identity guard before any deletion",
    async kind => {
      const target = await fixture();
      await changeLiveState(target);
      if (kind === "missing") {
        await owner.organizationMembership.delete({
          where: { id: target.member.membership.id },
        });
        // This member has no audit or backup actor FK; preferences cascade away.
        await owner.user.delete({ where: { id: target.member.user.id } });
      } else {
        const email = `changed-${randomUUID()}@example.test`;
        await owner.user.update({
          where: { id: target.member.user.id },
          data: { email, emailNormalized: email },
        });
      }

      await expectRejectedBeforeDeletion(
        target.organization.id,
        target.verified.data,
        kind === "missing"
          ? "RESTORE_USER_REFERENCE_MISSING"
          : "RESTORE_USER_IDENTITY_CHANGED"
      );
    }
  );

  it("rejects duplicate composite keys before mutating business data", async () => {
    const target = await fixture();
    const other = await fixture();
    await changeLiveState(target);
    const before = await snapshot(target.organization.id);
    const otherBefore = await snapshot(other.organization.id);
    const rawBefore = await rawPreferences(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company![0]!.legalName =
      "Earlier insert must never survive rollback";
    broken.UserWorkspacePreference!.push({
      ...broken.UserWorkspacePreference![0]!,
      preferences: '{"duplicate":"different payload, identical composite key"}',
    });

    await expect(restore(target.organization.id, broken)).rejects.toThrow(
      "BACKUP_REFERENCES_INVALID"
    );

    expect(await snapshot(target.organization.id)).toEqual(before);
    expect(await rawPreferences(target.organization.id)).toEqual(rawBefore);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  });
});

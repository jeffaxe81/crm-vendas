import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { TicketPriority, type Prisma } from "../generated/prisma/client";
import type { SnapshotData } from "./backup-manifest";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";
import { exportTenantSnapshot } from "./tenant-snapshot";

describe("transactional support configuration restore", () => {
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
  const deletedAt = "2026-10-03T12:00:00.234567Z";

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-support-config-"));
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
    const email = `support-restore-${randomUUID()}@example.test`;
    return owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Synthetic support restore operator",
        passwordHash: "synthetic-support-original-password",
      },
    });
  }

  async function identity() {
    const organization = await owner.organization.create({
      data: { name: "Support restore safety", slug: randomUUID() },
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

  async function createGraph(
    target: Awaited<ReturnType<typeof identity>>,
    auditUserId = target.user.id
  ) {
    const organizationId = target.organization.id;
    const authors = { createdBy: auditUserId, updatedBy: auditUserId };
    const queue = await owner.supportQueue.create({
      data: {
        organizationId,
        name: "Central",
        description: "Atendimento sintético: 'aspas', ç e 漢字",
        isActive: true,
        autoAssign: true,
        version: 3,
        ...authors,
      },
    });
    const inactiveQueue = await owner.supportQueue.create({
      data: {
        organizationId,
        name: "Fila inativa",
        description: null,
        isActive: false,
        autoAssign: false,
        version: 4,
        ...authors,
      },
    });
    const deletedQueue = await owner.supportQueue.create({
      data: {
        organizationId,
        // The partial unique index permits a deleted case-insensitive twin.
        name: "cEnTrAl",
        isActive: false,
        autoAssign: true,
        version: 5,
        deletedAt: new Date(deletedAt),
        deletedBy: auditUserId,
        ...authors,
      },
    });
    const policies = [];
    for (const [index, priority] of Object.values(TicketPriority).entries()) {
      policies.push(
        await owner.slaPolicy.create({
          data: {
            organizationId,
            priority,
            firstResponseMinutes: 15 * (index + 1),
            resolutionMinutes: 120 * (index + 1),
            isActive: index % 2 === 0,
            version: index + 2,
            ...authors,
          },
        })
      );
    }
    // Avoid Date's millisecond truncation when preparing the PostgreSQL fixture.
    for (const table of ["support_queues", "sla_policies"]) {
      await owner.$executeRawUnsafe(
        `UPDATE "${table}" SET created_at=$1::timestamptz,
          updated_at=$2::timestamptz WHERE organization_id=$3::uuid`,
        createdAt,
        updatedAt,
        organizationId
      );
    }
    await owner.$executeRawUnsafe(
      "UPDATE support_queues SET deleted_at=$1::timestamptz WHERE id=$2::uuid",
      deletedAt,
      deletedQueue.id
    );
    return { queue, inactiveQueue, deletedQueue, policies };
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
    const graph = await createGraph(target);
    return { ...target, ...graph, verified: await verifiedBackup(target) };
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
        // Inspect before leaving this transaction so rollback cannot hide a DELETE.
        expect(await snapshotInTransaction(tx, organizationId)).toEqual(before);
      },
      transactionOptions
    );
    expect(await snapshot(organizationId)).toEqual(before);
  }

  it("round-trips every SLA priority, queue flag and soft deletion with PostgreSQL microseconds", async () => {
    const target = await fixture();
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);
    const expected = target.verified.data;
    expect(
      expected.SupportQueue!.find(row => row.id === target.queue.id)
    ).toMatchObject({
      isActive: true,
      autoAssign: true,
      deletedAt: null,
      deletedBy: null,
      createdAt,
      updatedAt,
      version: 3,
    });
    expect(
      expected.SupportQueue!.find(row => row.id === target.inactiveQueue.id)
    ).toMatchObject({
      description: null,
      isActive: false,
      autoAssign: false,
      deletedAt: null,
      version: 4,
    });
    expect(
      expected.SupportQueue!.find(row => row.id === target.deletedQueue.id)
    ).toMatchObject({
      name: "cEnTrAl",
      isActive: false,
      autoAssign: true,
      deletedAt,
      deletedBy: target.user.id,
      createdAt,
      updatedAt,
      version: 5,
    });
    expect(expected.SlaPolicy!.map(row => row.priority).sort()).toEqual(
      Object.values(TicketPriority).sort()
    );
    for (const [index, policy] of target.policies.entries()) {
      expect(
        expected.SlaPolicy!.find(row => row.id === policy.id)
      ).toMatchObject({
        priority: policy.priority,
        isActive: index % 2 === 0,
        firstResponseMinutes: 15 * (index + 1),
        resolutionMinutes: 120 * (index + 1),
        createdAt,
        updatedAt,
        version: index + 2,
      });
    }

    await owner.supportQueue.update({
      where: { id: target.queue.id },
      data: {
        name: "Fila alterada",
        description: null,
        isActive: false,
        autoAssign: false,
        version: 6,
      },
    });
    await owner.supportQueue.update({
      where: { id: target.inactiveQueue.id },
      data: { isActive: true, autoAssign: true },
    });
    await owner.supportQueue.update({
      where: { id: target.deletedQueue.id },
      data: { deletedAt: null, deletedBy: null, isActive: true },
    });
    await owner.supportQueue.create({
      data: {
        organizationId: target.organization.id,
        name: "Fila posterior",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    await owner.slaPolicy.update({
      where: { id: target.policies[0]!.id },
      data: {
        firstResponseMinutes: 1,
        resolutionMinutes: 2,
        isActive: false,
        version: 10,
      },
    });
    // All priorities already exist: replace one policy with a post-backup ID.
    const replaced = target.policies[1]!;
    await owner.slaPolicy.delete({ where: { id: replaced.id } });
    await owner.slaPolicy.create({
      data: {
        organizationId: target.organization.id,
        priority: replaced.priority,
        firstResponseMinutes: 3,
        resolutionMinutes: 4,
        isActive: true,
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    const currentPassword = "synthetic-support-password-changed-after-backup";
    await owner.user.update({
      where: { id: target.user.id },
      data: { passwordHash: currentPassword },
    });

    await restore(target.organization.id, expected);

    expect(await snapshot(target.organization.id)).toEqual(expected);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      (await owner.user.findUniqueOrThrow({ where: { id: target.user.id } }))
        .passwordHash
    ).toBe(currentPassword);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: target.membership.id },
        })
      ).isSuperuser
    ).toBe(true);
  });

  it("removes a newer queue/SLA graph when restoring an authentic empty backup", async () => {
    const target = await identity();
    const verified = await verifiedBackup(target);
    expect(verified.data.SupportQueue).toEqual([]);
    expect(verified.data.SlaPolicy).toEqual([]);
    await createGraph(target);
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);

    await restore(target.organization.id, verified.data);

    expect(await snapshot(target.organization.id)).toEqual(verified.data);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: target.membership.id },
        })
      ).isSuperuser
    ).toBe(true);
  });

  it("rejects a deleted historical audit user before any queue/SLA deletion", async () => {
    const target = await identity();
    const historical = await createUser();
    await createGraph(target, historical.id);
    const verified = await verifiedBackup(target);
    expect(verified.data.User!.some(row => row.id === historical.id)).toBe(
      true
    );
    // This user has no membership or backup/audit rows. Reassign every live FK
    // before deleting it; the encrypted historical snapshot stays authentic.
    await owner.supportQueue.updateMany({
      where: { organizationId: target.organization.id },
      data: {
        createdBy: target.user.id,
        updatedBy: target.user.id,
        deletedBy: target.user.id,
      },
    });
    await owner.slaPolicy.updateMany({
      where: { organizationId: target.organization.id },
      data: { createdBy: target.user.id, updatedBy: target.user.id },
    });
    await owner.user.delete({ where: { id: historical.id } });
    expect(
      await owner.user.findUnique({ where: { id: historical.id } })
    ).toBeNull();

    await expectRejectedBeforeDeletion(
      target.organization.id,
      verified.data,
      "RESTORE_USER_REFERENCE_MISSING"
    );
  });

  it.each(["SupportQueue", "SlaPolicy"])(
    "rejects a missing %s audit FK before deleting the current graph",
    async model => {
      const target = await fixture();
      const broken = structuredClone(target.verified.data);
      broken[model]![0]!.updatedBy = randomUUID();
      await expectRejectedBeforeDeletion(
        target.organization.id,
        broken,
        "BACKUP_REFERENCES_INVALID"
      );
    }
  );

  it.each([
    ["queue name", "support_queues_org_name_active_key"],
    ["SLA duration", "sla_policies_resolution_after_first_response_check"],
  ])(
    "rolls back the full graph on the %s database constraint",
    async (kind, constraint) => {
      const target = await fixture();
      const other = await fixture();
      await owner.supportQueue.update({
        where: { id: target.queue.id },
        data: { name: "Fila atual a preservar" },
      });
      await owner.slaPolicy.update({
        where: { id: target.policies[0]!.id },
        data: { resolutionMinutes: 999 },
      });
      const before = await snapshot(target.organization.id);
      const otherBefore = await snapshot(other.organization.id);
      const broken = structuredClone(target.verified.data);
      if (kind === "queue name") {
        // Inactive still counts: only deleted_at excludes a row from this index.
        const twin = broken.SupportQueue!.find(
          row => row.id === target.deletedQueue.id
        )!;
        twin.deletedAt = null;
        twin.deletedBy = null;
      } else {
        broken.SupportQueue!.find(row => row.id === target.queue.id)!.name =
          "Fila inserida antes do erro de SLA";
        broken.SlaPolicy![0]!.firstResponseMinutes = 30;
        broken.SlaPolicy![0]!.resolutionMinutes = 29;
      }

      await expect(restore(target.organization.id, broken)).rejects.toThrow(
        constraint
      );

      expect(await snapshot(target.organization.id)).toEqual(before);
      expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    }
  );

  it.each(["current", "target"] as const)(
    "restores a queue-linked Ticket present only in the %s graph",
    async location => {
      const target = await identity();
      const graph = await createGraph(target);
      const createTicket = (queueId: string) =>
        owner.ticket.create({
          data: {
            organizationId: target.organization.id,
            protocol: "2026-000001",
            subject: "Ticket de suporte restaurável",
            queueId,
            createdBy: target.user.id,
            updatedBy: target.user.id,
          },
        });
      const historicalTicket =
        location === "target" ? await createTicket(graph.queue.id) : null;
      const verified = await verifiedBackup(target);
      if (historicalTicket)
        await owner.ticket.delete({ where: { id: historicalTicket.id } });
      await owner.supportQueue.deleteMany({
        where: { organizationId: target.organization.id },
      });
      const currentQueue = await owner.supportQueue.create({
        data: {
          organizationId: target.organization.id,
          name: "Fila atual exclusiva",
          createdBy: target.user.id,
          updatedBy: target.user.id,
        },
      });
      if (location === "current") await createTicket(currentQueue.id);

      await restore(target.organization.id, verified.data);

      expect(await snapshot(target.organization.id)).toEqual(verified.data);
    }
  );

});

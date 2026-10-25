import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import { BackupStore, BACKUP_ENVELOPE_OVERHEAD_BYTES } from "./backup-store";
import { BackupStorageInventoryService } from "./backup-storage-inventory.service";

describe("global read-only backup storage inventory under tenant RLS", () => {
  let owner: PrismaService;
  let restricted: PrismaService;
  let storageDirectory: string;
  let externalTarget: string;
  let store: BackupStore;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    restricted = new PrismaService(process.env.RLS_DATABASE_URL);

    const [role] = await restricted.$queryRawUnsafe<
      { rolbypassrls: boolean; rolsuper: boolean }[]
    >(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user"
    );
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    storageDirectory = await mkdtemp(join(tmpdir(), "axes-global-inventory-"));
    externalTarget = join(
      tmpdir(),
      `axes-global-inventory-target-${randomUUID()}`
    );
    store = new BackupStore({
      directory: storageDirectory,
      key: randomBytes(32),
      maxBytes: 1024 * 1024,
    });
  });

  afterEach(async () => {
    await rm(storageDirectory, { recursive: true, force: true });
    await rm(externalTarget, { force: true });
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await restricted?.onModuleDestroy();
  });

  async function createOrganization(name: string, slug: string) {
    return owner.organization.create({ data: { name, slug } });
  }

  async function catalogBackup(input: {
    organizationId: string;
    state: string;
    byteCount?: number;
    id?: string;
  }) {
    const completed = input.state === "COMPLETED";
    return owner.backupRecord.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        reason: "MANUAL",
        state: input.state,
        schemaVersion: completed ? 1 : null,
        checksum: completed ? "a".repeat(64) : null,
        counts: completed ? {} : undefined,
        completedAt: completed ? new Date() : null,
        byteCount:
          input.byteCount === undefined ? null : BigInt(input.byteCount),
      },
    });
  }

  it("reconciles tenant catalogs with sanitized findings", async () => {
    const [orgA, orgB, orgC] = await Promise.all([
      createOrganization("Inventory A", "inventory-a"),
      createOrganization("Inventory B", "inventory-b"),
      createOrganization("Inventory C", "inventory-c"),
    ]);

    const matching = await catalogBackup({
      organizationId: orgA.id,
      state: "COMPLETED",
      byteCount: 60,
    });
    const missing = await catalogBackup({
      organizationId: orgA.id,
      state: "COMPLETED",
      byteCount: 80,
    });
    const unreadable = await catalogBackup({
      organizationId: orgA.id,
      state: "COMPLETED",
      byteCount: 30,
    });
    const mismatch = await catalogBackup({
      organizationId: orgB.id,
      state: "COMPLETED",
      byteCount: 120,
    });
    await catalogBackup({
      organizationId: orgB.id,
      state: "RUNNING",
    });
    await catalogBackup({
      organizationId: orgC.id,
      state: "DELETING",
    });
    const deleted = await catalogBackup({
      organizationId: orgC.id,
      state: "DELETED",
      byteCount: 10,
    });

    await store.put(matching.id, Buffer.alloc(60));
    await store.put(mismatch.id, Buffer.alloc(20));
    await store.put(deleted.id, Buffer.alloc(10));

    await writeFile(externalTarget, "never follow this symlink");
    await symlink(
      externalTarget,
      join(storageDirectory, `${unreadable.id}.backup`)
    );

    const orphanId = randomUUID();
    await store.put(orphanId, Buffer.alloc(25));

    const temporaryName = `.${randomUUID()}.${randomUUID()}.tmp`;
    const unexpectedName = "do-not-expose-this-name.txt";
    await writeFile(join(storageDirectory, temporaryName), "temporary");
    await writeFile(join(storageDirectory, unexpectedName), "unexpected");

    const filesBefore = (await readdir(storageDirectory)).sort();
    const catalogBefore = await owner.backupRecord.count();
    const withTenant = jest.spyOn(restricted, "withTenant");

    const service = new BackupStorageInventoryService(restricted, store);
    const result = await service.scan();

    expect(new Set(withTenant.mock.calls.map(call => call[0]))).toEqual(
      new Set([orgA.id, orgB.id, orgC.id])
    );
    expect(result).toMatchObject({
      configured: true,
      readOnly: true,
      complete: true,
      catalogCount: 7,
      orphanCount: 1,
      missingCount: 1,
      sizeMismatchCount: 1,
      unreadableCount: 1,
      stateInconsistencyCount: 1,
      temporaryCount: 1,
      unexpectedCount: 1,
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backupId: orphanId.toLowerCase(),
          organizationId: null,
          status: "ORPHAN",
        }),
        expect.objectContaining({
          backupId: missing.id,
          organizationId: orgA.id,
          status: "MISSING",
        }),
        expect.objectContaining({
          backupId: mismatch.id,
          organizationId: orgB.id,
          status: "SIZE_MISMATCH",
        }),
        expect.objectContaining({
          backupId: unreadable.id,
          organizationId: orgA.id,
          status: "UNREADABLE",
        }),
        expect.objectContaining({
          backupId: deleted.id,
          organizationId: orgC.id,
          status: "STATE_INCONSISTENCY",
        }),
      ])
    );

    const matchingPhysical = 60 + BACKUP_ENVELOPE_OVERHEAD_BYTES;
    const mismatchPhysical = 20 + BACKUP_ENVELOPE_OVERHEAD_BYTES;
    const deletedPhysical = 10 + BACKUP_ENVELOPE_OVERHEAD_BYTES;
    const orphanPhysical = 25 + BACKUP_ENVELOPE_OVERHEAD_BYTES;
    expect(result.physicalBytes).toBe(
      String(
        matchingPhysical + mismatchPhysical + deletedPhysical + orphanPhysical
      )
    );
    expect(result.tenants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: orgA.id,
          physicalBytes: String(matchingPhysical),
        }),
        expect.objectContaining({
          organizationId: orgB.id,
          physicalBytes: String(mismatchPhysical),
        }),
        expect.objectContaining({
          organizationId: orgC.id,
          physicalBytes: String(deletedPhysical),
        }),
      ])
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(storageDirectory);
    expect(serialized).not.toContain(externalTarget);
    expect(serialized).not.toContain(temporaryName);
    expect(serialized).not.toContain(unexpectedName);

    expect(await owner.backupRecord.count()).toBe(catalogBefore);
    expect((await readdir(storageDirectory)).sort()).toEqual(filesBefore);
    expect(await store.read(matching.id)).toEqual(Buffer.alloc(60));
    expect(await store.read(mismatch.id)).toEqual(Buffer.alloc(20));
    expect(await store.read(deleted.id)).toEqual(Buffer.alloc(10));
    expect(await store.read(orphanId)).toEqual(Buffer.alloc(25));
  });

  it("leaves unconfigured storage incomplete", async () => {
    const org = await createOrganization("Inventory Null", "inventory-null");
    await catalogBackup({ organizationId: org.id, state: "RUNNING" });
    await catalogBackup({ organizationId: org.id, state: "DELETING" });

    const service = new BackupStorageInventoryService(restricted, null);
    const result = await service.scan();

    expect(result).toMatchObject({
      configured: false,
      readOnly: true,
      complete: false,
      catalogCount: 2,
      missingCount: 0,
      findings: [],
    });
    expect(result.tenants).toEqual([
      expect.objectContaining({ organizationId: org.id }),
    ]);
  });
});

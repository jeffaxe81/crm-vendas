import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { DataOperationWorker } from "./data-operation.worker";
import { PrismaService } from "../database/prisma.service";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import {
  backupStorageUsage,
  reserveBackupStorage,
} from "./backup-storage-capacity";
import { TenantStorageAllocationService } from "./tenant-storage-allocation.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";

/** Real PostgreSQL connections represent independent API/worker replicas. */
let jestRuntime: typeof jest;
beforeAll(async () => {
  const globalsModule = "@jest/globals";
  jestRuntime = (await import(globalsModule)).jest;
});

describe("atomic opt-in physical backup capacity", () => {
  let owner: PrismaService;
  let replicaA: PrismaService;
  let replicaB: PrismaService;
  let org: string;
  let other: string;
  let userId: string;
  let directory: string;
  let store: BackupStore;
  const options = { maxBytes: 8388608, snapshotTimeoutMs: 60000 };
  const gib = 1073741824n;
  const principal = () =>
    ({
      organizationId: org,
      userId,
      authMethod: "session",
      isSuperuser: true,
    }) as AuthenticatedPrincipal;
  const reserve = (
    client: PrismaService,
    tenant: string,
    id: string,
    bytes: bigint
  ) =>
    client.withTenant(tenant, tx =>
      reserveBackupStorage(tx, tenant, id, bytes)
    );
  const usage = () =>
    replicaA.withTenant(org, tx => backupStorageUsage(tx, org));
  const configure = (enforced?: boolean) =>
    new TenantStorageAllocationService(replicaA).configure(
      principal(),
      {
        allocatedGiB: 1,
        confirmation: "AJUSTAR COTA",
        ...(enforced === undefined ? {} : { enforced }),
      },
      randomUUID()
    );
  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    replicaA = new PrismaService(process.env.RLS_DATABASE_URL);
    replicaB = new PrismaService(process.env.RLS_DATABASE_URL);
    const [role] = await replicaA.$queryRawUnsafe<{ safe: boolean }[]>(
      "SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user"
    );
    expect(role?.safe).toBe(true);
  });
  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    org = (
      await owner.organization.create({
        data: { name: "Quota A", slug: "quota-a" },
      })
    ).id;
    other = (
      await owner.organization.create({
        data: { name: "Quota B", slug: "quota-b" },
      })
    ).id;
    userId = (
      await owner.user.create({
        data: {
          email: "quota@example.test",
          emailNormalized: "quota@example.test",
          displayName: "Quota",
          passwordHash: "synthetic",
        },
      })
    ).id;
    await owner.organizationMembership.create({
      data: { organizationId: org, userId, role: "ADMIN", isSuperuser: true },
    });
    directory = await mkdtemp(join(tmpdir(), "axes-quota-"));
    store = new BackupStore({
      directory,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
  });
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  afterAll(async () => {
    if (owner)
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
    await Promise.all(
      [owner, replicaA, replicaB]
        .filter(Boolean)
        .map(db => db.onModuleDestroy())
    );
  });
  it("preserves planning allocations and requires explicit activation", async () => {
    expect((await configure()).enforced).toBe(false);
    const admitted = randomUUID();
    await reserve(replicaA, org, admitted, 2n * gib);
    expect((await configure(true)).enforced).toBe(true);
    // Activation/lowering preserves already-admitted capacity and same-ID retries.
    await reserve(replicaB, org, admitted, gib);
    expect(await usage()).toEqual({ usedBytes: 0n, reservedBytes: 2n * gib });
    await expect(reserve(replicaB, org, randomUUID(), 1n)).rejects.toThrow(
      "BACKUP_QUOTA_EXCEEDED"
    );
    expect((await configure()).enforced).toBe(true);
    await configure(false);
    await reserve(replicaB, org, randomUUID(), 1n);
  });
  it("serializes two replicas, keeps same-ID retries idempotent and isolates another tenant", async () => {
    await configure(true);
    const ids = [randomUUID(), randomUUID()];
    const result = await Promise.allSettled([
      reserve(replicaA, org, ids[0]!, 700000000n),
      reserve(replicaB, org, ids[1]!, 700000000n),
    ]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter(r => r.status === "rejected")).toHaveLength(1);
    const winner = ids[result.findIndex(r => r.status === "fulfilled")]!;
    await Promise.all([
      reserve(replicaA, org, winner, 600000000n),
      reserve(replicaB, org, winner, 700000000n),
    ]);
    expect(await usage()).toEqual({ usedBytes: 0n, reservedBytes: 700000000n });
    await reserve(replicaB, other, randomUUID(), 2n * gib);
    const foreign = await replicaB.withTenant(other, tx =>
      tx.$queryRawUnsafe<unknown[]>(
        "SELECT * FROM public.backup_storage_reservations WHERE organization_id=$1::uuid",
        org
      )
    );
    expect(foreign).toEqual([]);
    const [rls] = await owner.$queryRawUnsafe<{ forced: boolean }[]>(
      "SELECT relforcerowsecurity AS forced FROM pg_class WHERE oid='public.backup_storage_reservations'::regclass"
    );
    expect(rls?.forced).toBe(true);
  });
  it("charges encryption overhead and preserves the existing valid backup on quota rejection", async () => {
    const service = new BackupService(replicaA, store, options);
    const kept = await service.create(org, userId, "MANUAL");
    const physical = BigInt(kept.byteCount! + 36);
    expect(await usage()).toEqual({ usedBytes: physical, reservedBytes: 0n });
    await configure(true);
    await reserve(replicaB, org, randomUUID(), gib - physical);
    await expect(service.create(org, userId, "MANUAL")).rejects.toThrow(
      "BACKUP_QUOTA_EXCEEDED"
    );
    await expect(service.verify(org, kept.id)).resolves.toBeDefined();
    expect(await store.objectSize(kept.id)).toBe(Number(physical));
  });
  it("retains uncertain publication capacity and adopts the immutable object on a same-ID retry", async () => {
    await configure(true);
    const service = new BackupService(replicaA, store, options);
    const id = randomUUID();
    const put = store.put.bind(store);
    const fail = jestRuntime
      .spyOn(store, "put")
      .mockImplementationOnce(async (key, bytes) => {
        await put(key, bytes);
        throw Error("fsync acknowledgement lost");
      });
    await expect(service.create(org, userId, "MANUAL", id)).rejects.toThrow(
      "BACKUP_FAILED"
    );
    const size = await store.objectSize(id);
    expect(size).not.toBeNull();
    expect(await usage()).toEqual({
      usedBytes: 0n,
      reservedBytes: BigInt(size!),
    });
    fail.mockRestore();
    const retry = await service.create(org, userId, "MANUAL", id);
    expect(retry.state).toBe("COMPLETED");
    expect(await usage()).toEqual({
      usedBytes: BigInt(size!),
      reservedBytes: 0n,
    });
    expect((await service.create(org, userId, "MANUAL", id)).id).toBe(id);
    expect(await usage()).toEqual({
      usedBytes: BigInt(size!),
      reservedBytes: 0n,
    });
  });
  it("takes maintenance shared before heartbeat operation row locks when restore is queued", async () => {
    const operation = await owner.dataOperation.create({
      data: {
        organizationId: org,
        kind: "BACKUP",
        state: "RUNNING",
        workerId: "heartbeat-order",
        attempts: 1,
        leaseUntil: new Date(Date.now() + 60000),
        payload: { reason: "SCHEDULED" },
      },
    });
    const holder = new Client({
      connectionString: process.env.RLS_DATABASE_URL,
      application_name: "quota-shared-holder",
    });
    const exclusive = new Client({
      connectionString: process.env.RLS_DATABASE_URL,
      application_name: "quota-exclusive-waiter",
    });
    const heartbeatUrl = new URL(process.env.RLS_DATABASE_URL!);
    heartbeatUrl.searchParams.set("application_name", "quota-heartbeat-order");
    const heartbeatDb = new PrismaService(heartbeatUrl.toString());
    let heartbeat: Promise<boolean> | undefined;
    let exclusiveLock: Promise<unknown> | undefined;
    const waitForAdvisory = async (name: string) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const [waiting] = await owner.$queryRawUnsafe<{ waiting: boolean }[]>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory') AS waiting",
          name
        );
        if (waiting?.waiting) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw Error("Expected advisory waiter: " + name);
    };
    try {
      await Promise.all([holder.connect(), exclusive.connect()]);
      await holder.query("BEGIN");
      await holder.query(
        "SELECT set_config('app.current_organization_id',$1,true)",
        [org]
      );
      await holder.query(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
        [`tenant-maintenance:${org}`]
      );
      await exclusive.query("BEGIN");
      exclusiveLock = exclusive.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`tenant-maintenance:${org}`]
      );
      await waitForAdvisory("quota-exclusive-waiter");
      heartbeat = new DataOperationWorker(heartbeatDb).heartbeat(operation);
      await waitForAdvisory("quota-heartbeat-order");
      // With row-before-maintenance ordering this fails immediately with 55P03.
      await holder.query(
        "SELECT id FROM public.data_operations WHERE id=$1::uuid FOR UPDATE NOWAIT",
        [operation.id]
      );
      await holder.query("ROLLBACK");
      await exclusiveLock;
      await exclusive.query("ROLLBACK");
      expect(await heartbeat).toBe(true);
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      if (exclusiveLock) await exclusiveLock.catch(() => {});
      await exclusive.query("ROLLBACK").catch(() => {});
      if (heartbeat) await heartbeat.catch(() => {});
      await Promise.all([
        holder.end(),
        exclusive.end(),
        heartbeatDb.onModuleDestroy(),
      ]);
    }
  });
  it("keeps physical charges on unlink failure and releases only after successful retention", async () => {
    const service = new BackupService(replicaA, store, options);
    const records = [];
    for (let index = 0; index < 8; index++)
      records.push(await service.create(org, userId, "MANUAL"));
    const before = await usage();
    const remove = jestRuntime
      .spyOn(store, "remove")
      .mockRejectedValueOnce(Error("synthetic unlink denial"));
    await expect(service.pruneRetention(org, 7)).rejects.toThrow(
      "synthetic unlink denial"
    );
    expect(await usage()).toEqual(before);
    await expect(service.verify(org, records[0]!.id)).resolves.toBeDefined();
    remove.mockRestore();
    expect(await service.pruneRetention(org, 7)).toBe(1);
    expect(await usage()).toEqual({
      usedBytes: before.usedBytes - BigInt(records[0]!.byteCount! + 36),
      reservedBytes: 0n,
    });
    expect(await store.objectSize(records[0]!.id)).toBeNull();
    await expect(service.verify(org, records[7]!.id)).resolves.toBeDefined();
  });
});

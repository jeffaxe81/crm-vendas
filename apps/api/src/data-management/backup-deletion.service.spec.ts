import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { BackupDeletionService } from "./backup-deletion.service";
import { BackupStore } from "./backup-store";
import type { BackupService } from "./backup.service";

// These tests exercise real encrypted-file I/O. PostgreSQL integration tests
// separately prove the transaction locks, authorization and RLS boundary.
describe("queued deletion safety after enqueue", () => {
  let directory: string;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function fixture() {
    directory = await mkdtemp(join(tmpdir(), "axes-delete-revalidate-"));
    const store = new BackupStore({
      directory,
      key: randomBytes(32),
      maxBytes: 1024,
    });
    const organizationId = randomUUID();
    const target = {
      id: randomUUID(),
      state: "DELETING",
      errorCode: null as string | null,
    };
    const keeper = { id: randomUUID(), state: "COMPLETED" };
    await store.put(target.id, Buffer.from("older readable copy"));
    await store.put(keeper.id, Buffer.from("newest readable copy"));
    const audits: string[] = [];
    let activeOperations = 0;
    const tx = {
      backupRecord: {
        async findMany() {
          return target.state === "DELETING" ? [{ id: target.id }] : [];
        },
        async findFirst({ where }: { where: { id?: string; state?: string } }) {
          return where.id === target.id
            ? target.state === where.state
              ? target
              : null
            : keeper;
        },
        async update({ data }: { data: Partial<typeof target> }) {
          Object.assign(target, data);
          return target;
        },
        async updateMany({ data }: { data: Partial<typeof target> }) {
          Object.assign(target, data);
          return { count: 1 };
        },
      },
      dataOperation: {
        async count() {
          return activeOperations;
        },
      },
      operationPreview: {
        async count() {
          return 0;
        },
      },
      auditLog: {
        async create({ data }: { data: { action: string } }) {
          audits.push(data.action);
        },
      },
    };
    const run = async (
      _org: string,
      callback: (client: Prisma.TransactionClient) => Promise<unknown>
    ) => callback(tx as unknown as Prisma.TransactionClient);
    const prisma = {
      organization: {
        async findMany() {
          return [{ id: organizationId }];
        },
      },
      withTenant: run,
      withMaintenance: run,
    } as unknown as PrismaService;
    const verifier = {
      async verify(_org: string, id: string) {
        await store.read(id);
      },
    } as unknown as BackupService;
    const service = new BackupDeletionService(prisma, store, verifier, {
      maxBytes: 1024,
      snapshotTimeoutMs: 5000,
    });
    return {
      store,
      target,
      keeper,
      audits,
      service,
      setActiveOperations: (value: number) => {
        activeOperations = value;
      },
    };
  }

  it("keeps the queued object if the keeper becomes corrupt after acceptance", async () => {
    const f = await fixture();
    await writeFile(
      join(directory, `${f.keeper.id}.backup`),
      Buffer.from("corrupt after acceptance")
    );
    await f.service.reconcile();
    await expect(f.store.read(f.target.id)).resolves.toEqual(
      Buffer.from("older readable copy")
    );
    expect(f.target.state).toBe("DELETING");
    expect(f.audits).toEqual([]);
  });

  it("waits for operations queued after acceptance and resumes after they finish", async () => {
    const f = await fixture();
    f.setActiveOperations(1);
    await f.service.reconcile();
    await expect(f.store.read(f.target.id)).resolves.toEqual(
      Buffer.from("older readable copy")
    );
    expect(f.target.state).toBe("DELETING");
    f.setActiveOperations(0);
    await f.service.reconcile();
    await expect(f.store.read(f.target.id)).rejects.toThrow();
    expect(f.target.state).toBe("DELETED");
    expect(f.audits).toEqual(["backup.deleted"]);
  });
});

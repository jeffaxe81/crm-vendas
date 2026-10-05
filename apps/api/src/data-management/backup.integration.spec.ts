import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import type { Prisma } from "../generated/prisma/client";

describe("verified tenant backup catalog and RepeatableRead snapshot", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let service: BackupService;
  let root: string;
  const options = { maxBytes: 8388608, snapshotTimeoutMs: 60000 };
  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-backup-integration-"));
    store = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    service = new BackupService(runtime, store, options);
  });
  async function reset() {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
  }
  beforeEach(reset);
  afterAll(async () => {
    if (owner) {
      await reset();
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
    if (root) await rm(root, { recursive: true, force: true });
  });
  async function fixture() {
    const organization = await owner.organization.create({
      data: { name: "Snapshot A", slug: "snapshot-a" },
    });
    const other = await owner.organization.create({
      data: { name: "Snapshot B", slug: "snapshot-b" },
    });
    const user = await owner.user.create({
      data: {
        email: "shared@example.test",
        emailNormalized: "shared@example.test",
        displayName: "Shared",
        passwordHash: "synthetic-do-not-export",
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
    await owner.organizationMembership.create({
      data: { organizationId: other.id, userId: user.id, role: "ADMIN" },
    });
    const company = await owner.company.create({
      data: {
        organizationId: organization.id,
        legalName: "Original A",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await owner.company.create({
      data: {
        organizationId: other.id,
        legalName: "Private B",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await owner.$executeRawUnsafe(
      "UPDATE companies SET created_at='2026-10-05T01:00:00.123456Z' WHERE id=$1::uuid",
      company.id
    );
    await owner.product.create({
      data: {
        organizationId: organization.id,
        code: "exact",
        name: "Exact",
        unitPrice: "900719925474099.99",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await owner.$executeRawUnsafe(
      "INSERT INTO user_workspace_preferences(organization_id,user_id,preferences,created_at,updated_at) VALUES($1::uuid,$2::uuid,$3::jsonb,now(),now())",
      organization.id,
      user.id,
      '{"exact":900719925474099.99,"nullable":null}'
    );
    await owner.integrationCredential.create({
      data: {
        organizationId: organization.id,
        name: "Synthetic",
        keyPrefix: "syn",
        keyHash: "synthetic-key-hash",
        scopes: ["companies:read"],
        createdBy: user.id,
      },
    });
    return { organization, other, user, company };
  }
  it("verifies the encrypted object before completion and excludes other tenants and secrets", async () => {
    const { organization, other, user } = await fixture();
    const record = await service.create(organization.id, user.id, "MANUAL");
    expect(record.state).toBe("COMPLETED");
    const backup = await service.verify(organization.id, record.id);
    expect(backup.data.Company!.map(row => row.legalName)).toEqual([
      "Original A",
    ]);
    expect(backup.data.Company![0]!.createdAt).toBe(
      "2026-10-05T01:00:00.123456Z"
    );
    expect(backup.data.Product![0]!.unitPrice).toBe("900719925474099.99");
    expect(
      String(backup.data.UserWorkspacePreference![0]!.preferences)
    ).toContain("900719925474099.99");
    expect(Object.keys(backup.data.User![0]!)).toEqual([
      "displayName",
      "email",
      "id",
    ]);
    expect(backup.bytes.toString()).not.toMatch(
      /passwordHash|keyHash|isSuperuser|synthetic-do-not-export|synthetic-key-hash|Private B|RefreshSession|BackupRecord|DataOperation/
    );
    expect(record.byteCount).toBe(backup.bytes.length);
    expect(record.counts).toEqual(backup.manifest.counts);
    await expect(service.verify(other.id, record.id)).rejects.toThrow(
      "BACKUP_NOT_FOUND"
    );
    expect(await runtime.$queryRawUnsafe("SELECT id FROM backups")).toEqual([]);
    expect(
      await runtime.withTenant(other.id, tx =>
        tx.$queryRawUnsafe("SELECT id FROM backups")
      )
    ).toEqual([]);
    const actions = await runtime.withTenant(organization.id, tx =>
      tx.auditLog.findMany({
        where: { entityId: record.id },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    );
    expect(actions.map(a => a.action)).toEqual([
      "backup.requested",
      "backup.completed",
    ]);
  });
  it("uses one stable snapshot while a separate transaction commits a company update", async () => {
    const { organization, user, company } = await fixture();
    let changed = false;
    const interleaved = new Proxy(runtime, {
      get(target, key) {
        if (key !== "withTenant") return Reflect.get(target, key, target);
        return <T>(
          org: string,
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
          transactionOptions?: {
            isolationLevel?: Prisma.TransactionIsolationLevel;
            timeout?: number;
          }
        ) =>
          target.withTenant(
            org,
            async tx =>
              callback(
                new Proxy(tx, {
                  get(transaction, method) {
                    if (method !== "$queryRawUnsafe")
                      return Reflect.get(transaction, method, transaction);
                    return async (sql: string, ...params: unknown[]) => {
                      if (
                        transactionOptions?.isolationLevel ===
                          "RepeatableRead" &&
                        sql.includes('FROM "public"."companies"') &&
                        !changed
                      ) {
                        changed = true;
                        await owner.company.update({
                          where: { id: company.id },
                          data: { legalName: "Changed A" },
                        });
                      }
                      return transaction.$queryRawUnsafe(sql, ...params);
                    };
                  },
                })
              ),
            transactionOptions
          );
      },
    });
    const isolated = new BackupService(interleaved, store, options);
    const record = await isolated.create(organization.id, user.id, "MANUAL");
    expect(changed).toBe(true);
    expect(
      (await service.verify(organization.id, record.id)).data.Company![0]!
        .legalName
    ).toBe("Original A");
    expect(
      (await owner.company.findUniqueOrThrow({ where: { id: company.id } }))
        .legalName
    ).toBe("Changed A");
  });
  it("rejects corrupted ciphertext and authenticated unsupported versions", async () => {
    const { organization, user } = await fixture();
    const record = await service.create(organization.id, user.id, "MANUAL");
    const plain = await store.read(record.id);
    const path = join(root, `${record.id}.backup`);
    const bytes = await readFile(path);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    await writeFile(path, bytes);
    await expect(service.verify(organization.id, record.id)).rejects.toThrow(
      "BACKUP_INVALID"
    );
    await store.remove(record.id);
    const document = JSON.parse(plain.toString());
    document.manifest.schemaVersion = 2;
    await store.put(record.id, Buffer.from(JSON.stringify(document)));
    await expect(service.verify(organization.id, record.id)).rejects.toThrow(
      "BACKUP_VERSION_UNSUPPORTED"
    );
  });
  it("records storage failure without publishing completion or changing business data", async () => {
    const { organization, user, company } = await fixture();
    const unavailable = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    unavailable.put = async () => {
      throw Object.assign(Error("synthetic disk full"), { code: "ENOSPC" });
    };
    await expect(
      new BackupService(runtime, unavailable, options).create(
        organization.id,
        user.id,
        "MANUAL"
      )
    ).rejects.toThrow();
    const rows = await runtime.withTenant(organization.id, tx =>
      tx.$queryRawUnsafe<{ state: string; error_code: string }[]>(
        "SELECT state,error_code FROM backups"
      )
    );
    expect(rows).toEqual([{ state: "FAILED", error_code: "BACKUP_FAILED" }]);
    expect(
      (await owner.company.findUniqueOrThrow({ where: { id: company.id } }))
        .legalName
    ).toBe("Original A");
    expect(
      await owner.auditLog.count({
        where: { organizationId: organization.id, action: "backup.completed" },
      })
    ).toBe(0);
  });
  it("denies ordinary administrators and missing configuration before creating a catalog row", async () => {
    const { other, user } = await fixture();
    await expect(service.create(other.id, user.id, "MANUAL")).rejects.toThrow(
      "BACKUP_FORBIDDEN"
    );
    await expect(
      new BackupService(runtime, null, options).create(
        other.id,
        user.id,
        "MANUAL"
      )
    ).rejects.toThrow("BACKUP_NOT_CONFIGURED");
    expect(
      await runtime.withTenant(other.id, tx =>
        tx.$queryRawUnsafe("SELECT id FROM backups")
      )
    ).toEqual([]);
  });
  it("rejects database columns absent from the reviewed schema", async () => {
    const { organization, user } = await fixture();
    await owner.$executeRawUnsafe(
      "ALTER TABLE companies ADD COLUMN unregistered_backup_fixture text"
    );
    try {
      await expect(
        service.create(organization.id, user.id, "MANUAL")
      ).rejects.toThrow("BACKUP_SCHEMA_UNSUPPORTED");
      expect(
        await owner.auditLog.count({
          where: {
            organizationId: organization.id,
            action: "backup.completed",
          },
        })
      ).toBe(0);
    } finally {
      await owner.$executeRawUnsafe(
        "ALTER TABLE companies DROP COLUMN unregistered_backup_fixture"
      );
    }
  });
  it("rolls back catalog completion when mandatory audit fails", async () => {
    const { organization, user } = await fixture();
    await owner.$executeRawUnsafe(
      "CREATE FUNCTION public.reject_backup_completion_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'backup.completed' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$"
    );
    await owner.$executeRawUnsafe(
      "CREATE TRIGGER reject_backup_completion_fixture BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.reject_backup_completion_fixture()"
    );
    try {
      await expect(
        service.create(organization.id, user.id, "MANUAL")
      ).rejects.toThrow();
      const rows = await runtime.withTenant(organization.id, tx =>
        tx.$queryRawUnsafe<{ id: string; state: string }[]>(
          "SELECT id,state FROM public.backups"
        )
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.state).toBe("FAILED");
      expect(
        await owner.auditLog.count({
          where: {
            organizationId: organization.id,
            action: "backup.completed",
          },
        })
      ).toBe(0);
      await expect(store.read(rows[0]!.id)).rejects.toThrow();
    } finally {
      await owner.$executeRawUnsafe(
        "DROP TRIGGER reject_backup_completion_fixture ON public.audit_logs"
      );
      await owner.$executeRawUnsafe(
        "DROP FUNCTION public.reject_backup_completion_fixture()"
      );
    }
  });
});

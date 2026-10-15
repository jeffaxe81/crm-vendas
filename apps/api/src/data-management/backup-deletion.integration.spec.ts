import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";

import { AppModule } from "../app.module";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { BACKUP_STORE, BackupService } from "./backup.service";
import { BackupStore } from "./backup-store";
import { BackupWorkerRunner } from "./backup-worker.runner";
import { BackupWorkerRuntime } from "./backup-worker.runtime";

describe("confirmed backup deletion with restricted PostgreSQL/RLS", () => {
  let app: INestApplication;
  let owner: PrismaService;
  let runtime: PrismaService;
  let store: BackupStore;
  let directory: string;
  let token: string;
  let organizationId: string;
  let userId: string;
  let older: { id: string; checksum: string | null };
  let newest: { id: string; checksum: string | null };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) throw Error("Restricted role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    const [role] = await runtime.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    directory = await mkdtemp(join(tmpdir(), "axes-backup-delete-"));
    store = new BackupStore({
      directory,
      key: randomBytes(32),
      maxBytes: 8_388_608,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(runtime)
      .overrideProvider(BACKUP_STORE)
      .useValue(store)
      .overrideProvider(BackupWorkerRuntime)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });

  async function clearAuditFailure() {
    await owner.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS test_backup_delete_audit ON public.audit_logs"
    );
    await owner.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS public.test_backup_delete_audit()"
    );
  }

  async function rejectAudit(action: string) {
    // The action comes only from these test literals, never from a request.
    await owner.$executeRawUnsafe(
      `CREATE FUNCTION public.test_backup_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`
    );
    await owner.$executeRawUnsafe(
      "CREATE TRIGGER test_backup_delete_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test_backup_delete_audit()"
    );
  }

  beforeEach(async () => {
    await clearAuditFailure();
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        organizationName: `Delete ${randomUUID()}`,
        adminDisplayName: "Backup owner",
        adminEmail: `delete-${randomUUID()}@example.test`,
        adminPassword: "synthetic-password-123!",
      })
      .expect(201);
    token = registered.body.accessToken;
    organizationId = registered.body.organization.id;
    userId = registered.body.user.id;
    await owner.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { isSuperuser: true },
    });
    older = await app
      .get(BackupService)
      .create(organizationId, userId, "MANUAL");
    newest = await app
      .get(BackupService)
      .create(organizationId, userId, "MANUAL");
  });

  afterEach(async () => {
    await clearAuditFailure();
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    if (owner) {
      await clearAuditFailure();
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  function remove(
    backup = older,
    body: Record<string, unknown> = {
      confirmation: "EXCLUIR BACKUP",
      checksum: backup.checksum,
    }
  ) {
    return request(app.getHttpServer())
      .delete(`/api/v1/admin/backups/${backup.id}`)
      .auth(token, { type: "bearer" })
      .send(body);
  }

  async function state(id = older.id) {
    return runtime.withTenant(organizationId, tx =>
      tx.backupRecord.findUniqueOrThrow({ where: { id } })
    );
  }

  it("queues a durable deletion, removes the encrypted file and retains audited metadata", async () => {
    await remove()
      .expect(202)
      .expect(({ body }) =>
        expect(body).toEqual({ id: older.id, state: "DELETING" })
      );
    expect((await state()).state).toBe("DELETING");
    await expect(store.read(older.id)).resolves.toBeInstanceOf(Buffer);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/backups/${older.id}/download`)
      .auth(token, { type: "bearer" })
      .expect(400);
    await app.get(BackupWorkerRunner).runCycle();
    expect((await state()).state).toBe("DELETED");
    await expect(store.read(older.id)).rejects.toThrow();
    await expect(store.read(newest.id)).resolves.toBeInstanceOf(Buffer);
    const actions = await runtime.withTenant(organizationId, tx =>
      tx.auditLog.findMany({
        where: {
          entityId: older.id,
          action: { in: ["backup.deletion_requested", "backup.deleted"] },
        },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    );
    expect(actions.map(row => row.action)).toEqual([
      "backup.deletion_requested",
      "backup.deleted",
    ]);
    await remove()
      .expect(202)
      .expect(({ body }) => expect(body.state).toBe("DELETED"));
  });

  it("requires the exact confirmation and the selected backup checksum", async () => {
    for (const body of [
      {},
      { confirmation: "EXCLUIR BACKUP", checksum: "0".repeat(64) },
      { confirmation: "EXCLUIR", checksum: older.checksum },
      {
        confirmation: "EXCLUIR BACKUP",
        checksum: older.checksum,
        path: "/tmp/other",
      },
    ]) {
      await remove(older, body).expect(400);
    }
    expect((await state()).state).toBe("COMPLETED");
  });

  it("protects the newest completed backup and pending operations", async () => {
    await remove(newest).expect(409);
    await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.create({
        data: {
          organizationId,
          actorUserId: userId,
          kind: "RESTORE",
          preventiveBackupId: older.id,
        },
      })
    );
    await remove().expect(409);
    expect((await state()).state).toBe("COMPLETED");
  });

  it("protects a backup with an unexpired restore preview", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/backups/${older.id}/preview`)
      .auth(token, { type: "bearer" })
      .expect(201);
    await remove().expect(409);
  });

  it("retains an older valid copy if the newest completed file is corrupt", async () => {
    await writeFile(
      join(directory, `${newest.id}.backup`),
      Buffer.from("corrupt")
    );
    await remove().expect(409);
    expect((await state()).state).toBe("COMPLETED");
    await expect(store.read(older.id)).resolves.toBeInstanceOf(Buffer);
  });

  it("finishes a committed deletion even after the organization is disabled", async () => {
    await remove().expect(202);
    await owner.organization.update({
      where: { id: organizationId },
      data: { isActive: false },
    });
    await app.get(BackupWorkerRunner).runCycle();
    expect((await state()).state).toBe("DELETED");
  });

  it("rejects IDs belonging to another tenant and ordinary administrators", async () => {
    const otherOrg = await owner.organization.create({
      data: { name: "Other", slug: randomUUID() },
    });
    const foreign = await owner.backupRecord.create({
      data: { organizationId: otherOrg.id, reason: "MANUAL" },
    });
    await remove({ id: foreign.id, checksum: older.checksum }).expect(404);
    await owner.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { isSuperuser: false },
    });
    await remove().expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/backups/${older.id}`)
      .send({ confirmation: "EXCLUIR BACKUP", checksum: older.checksum })
      .expect(401);
    expect((await state()).state).toBe("COMPLETED");
  });

  it("records one request under concurrent retries", async () => {
    const results = await Promise.all([remove(), remove()]);
    expect(results.map(result => result.status)).toEqual([202, 202]);
    const count = await runtime.withTenant(organizationId, tx =>
      tx.auditLog.count({
        where: { action: "backup.deletion_requested", entityId: older.id },
      })
    );
    expect(count).toBe(1);
  });

  it("keeps the catalog and file intact when request auditing fails", async () => {
    await rejectAudit("backup.deletion_requested");
    await remove().expect(500);
    expect((await state()).state).toBe("COMPLETED");
    await expect(store.read(older.id)).resolves.toBeInstanceOf(Buffer);
  });

  it("retries file I/O failure and a crash after unlink before final commit", async () => {
    await remove().expect(202);
    jest
      .spyOn(store, "remove")
      .mockRejectedValueOnce(Error("synthetic I/O failure"));
    await app.get(BackupWorkerRunner).runCycle();
    expect((await state()).state).toBe("DELETING");
    await expect(store.read(older.id)).resolves.toBeInstanceOf(Buffer);
    await rejectAudit("backup.deleted");
    await app.get(BackupWorkerRunner).runCycle();
    expect((await state()).state).toBe("DELETING");
    await expect(store.read(older.id)).rejects.toThrow();
    await clearAuditFailure();
    await app.get(BackupWorkerRunner).runCycle();
    expect((await state()).state).toBe("DELETED");
  });
});

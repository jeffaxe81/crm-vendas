import { PrismaService } from "../database/prisma.service";
import { DataOperationWorker } from "./data-operation.worker";

describe("durable data-operation claims under tenant RLS", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let organizationId: string;
  let worker: DataOperationWorker;
  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    worker = new DataOperationWorker(runtime);
    const [role] = await runtime.$queryRawUnsafe<
      { rolbypassrls: boolean; rolsuper: boolean }[]
    >("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname=current_user");
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
  });
  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    organizationId = (
      await owner.organization.create({
        data: { name: "Worker A", slug: "worker-a" },
      })
    ).id;
  });
  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
  });
  async function queue(checkpoint = {}) {
    return runtime.withTenant(organizationId, tx =>
      tx.dataOperation.create({
        data: { organizationId, kind: "BACKUP", checkpoint },
      })
    );
  }
  it("allows two replicas to claim a pending job only once", async () => {
    const original = await queue();
    const claims = await Promise.all([
      worker.claimNext("replica-a"),
      worker.claimNext("replica-b"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const job = claims.find(Boolean)!;
    expect(job.id).toBe(original.id);
    expect(job.state).toBe("RUNNING");
    expect(job.attempts).toBe(1);
    expect(job.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await worker.claimNext("replica-c")).toBeNull();
  });
  it("reclaims an expired lease with its durable checkpoint and fences the previous claimant", async () => {
    const original = await queue({
      businessCommitted: true,
      backupId: "persisted-result",
    });
    const first = (await worker.claimNext("replica-a"))!;
    await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.update({
        where: { id: original.id },
        data: { leaseUntil: new Date(0) },
      })
    );
    const restarted = (await new DataOperationWorker(runtime).claimNext(
      "replica-b"
    ))!;
    expect(restarted.id).toBe(original.id);
    expect(restarted.attempts).toBe(2);
    expect(restarted.checkpoint).toEqual(original.checkpoint);
    expect(await worker.heartbeat(first)).toBe(false);
    expect(await worker.finish(first)).toBe(false);
    expect(await worker.heartbeat(restarted)).toBe(true);
    expect(await worker.finish(restarted)).toBe(true);
    expect(await worker.claimNext("replica-c")).toBeNull();
  });
  it("keeps other jobs in the same organization queued while one lease is live", async () => {
    await queue();
    await queue();
    const claims = await Promise.all([
      worker.claimNext("replica-a"),
      worker.claimNext("replica-b"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await worker.claimNext("replica-c")).toBeNull();
  });
  it("does not heartbeat or complete a job after its lease expires", async () => {
    await queue();
    const job = (await worker.claimNext("replica-a"))!;
    await runtime.withTenant(organizationId, tx =>
      tx.dataOperation.update({
        where: { id: job.id },
        data: { leaseUntil: new Date(0) },
      })
    );
    expect(await worker.heartbeat(job)).toBe(false);
    expect(await worker.finish(job)).toBe(false);
  });
});

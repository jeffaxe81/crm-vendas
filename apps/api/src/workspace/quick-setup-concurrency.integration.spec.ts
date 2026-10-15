import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { QuickSetupState } from "@axes/contracts";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { permissionsForRole } from "../authorization/permissions";
import { PrismaService } from "../database/prisma.service";
import { QuickSetupService } from "./quick-setup.service";

describe("quick setup concurrent progress", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let service: QuickSetupService;
  let principal: AuthenticatedPrincipal;
  const applicationName = `quick-setup-${randomUUID()}`;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    const connection = new URL(process.env.RLS_DATABASE_URL);
    connection.searchParams.set("application_name", applicationName);
    runtime = new PrismaService(connection.toString());
    service = new QuickSetupService(runtime);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    const organization = await owner.organization.create({
      data: { name: "Concurrent quick setup", slug: randomUUID() },
    });
    const email = `quick-setup-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Setup administrator",
        passwordHash: "synthetic",
      },
    });
    const membership = await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        quickSetupCompletedSteps: ["organization"],
      },
    });
    principal = {
      userId: user.id,
      organizationId: organization.id,
      membershipId: membership.id,
      role: "ADMIN",
      sessionId: randomUUID(),
      permissions: permissionsForRole("ADMIN"),
      authMethod: "session",
    };
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

  async function waitForBlockedProgress(count: number): Promise<void> {
    const deadline = Date.now() + 2_000;
    do {
      const [activity] = await owner.$queryRawUnsafe<{ blocked: number }[]>(
        `SELECT count(*)::int AS blocked
         FROM pg_stat_activity
         WHERE application_name=$1
           AND wait_event_type='Lock'
           AND cardinality(pg_blocking_pids(pid))>0
           AND query ILIKE '%organization_memberships%'`,
        applicationName
      );
      if (activity?.blocked === count) return;
    } while (Date.now() < deadline);
    throw Error(`Expected ${count} quick setup operations blocked on the row`);
  }

  async function raceProgress(
    first: Record<string, unknown>,
    second: Record<string, unknown>
  ): Promise<QuickSetupState[]> {
    const blocker = new Client({
      connectionString:
        process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    const operations: Promise<QuickSetupState>[] = [];
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM organization_memberships WHERE id=$1::uuid FOR UPDATE",
        [principal.membershipId]
      );

      operations.push(
        service.progress(first, { principal, requestId: "concurrent-first" })
      );
      await waitForBlockedProgress(1);
      operations.push(
        service.progress(second, { principal, requestId: "concurrent-second" })
      );
      // Both requests have reached the same held row. This forces the old
      // read/modify/write implementation to compute from the same stale state.
      await waitForBlockedProgress(2);
    } finally {
      await blocker.query("ROLLBACK");
      await Promise.allSettled(operations);
      await blocker.end();
    }
    return Promise.all(operations);
  }

  it("keeps both steps when two sessions save progress concurrently", async () => {
    await raceProgress({ stepId: "team" }, { stepId: "commercial-data" });

    expect((await service.read(principal)).completedSteps).toEqual([
      "organization",
      "team",
      "commercial-data",
    ]);
    const audit = await owner.auditLog.findMany({
      where: { organizationId: principal.organizationId },
      select: { action: true, metadata: true },
    });
    expect(audit).toEqual(
      expect.arrayContaining([
        {
          action: "quick_setup.progressed",
          metadata: { stepId: "team", completed: false },
        },
        {
          action: "quick_setup.progressed",
          metadata: { stepId: "commercial-data", completed: false },
        },
      ])
    );
  });

  it("preserves completion when an older step waits behind final review", async () => {
    await owner.organizationMembership.update({
      where: { id: principal.membershipId },
      data: {
        quickSetupCompletedSteps: [
          "organization",
          "team",
          "sales-structure",
          "commercial-data",
          "help",
        ],
      },
    });

    const results = await raceProgress(
      { stepId: "review", complete: true },
      { stepId: "organization" }
    );

    expect(results.map(result => result.completed)).toEqual([true, true]);
    expect((await service.read(principal)).completed).toBe(true);
    expect(
      await owner.auditLog.findMany({
        where: { organizationId: principal.organizationId },
        select: { action: true },
      })
    ).toEqual([{ action: "quick_setup.completed" }]);
  });

  it("does not resurrect stale steps when progress waits behind reopen", async () => {
    const blocker = new Client({
      connectionString:
        process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    const operations: Promise<QuickSetupState>[] = [];
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM organization_memberships WHERE id=$1::uuid FOR UPDATE",
        [principal.membershipId]
      );

      operations.push(
        service.reopen({
          principal,
          requestId: "concurrent-reopen",
        })
      );
      await waitForBlockedProgress(1);
      operations.push(
        service.progress(
          { stepId: "team" },
          { principal, requestId: "progress-after-reopen" }
        )
      );
      await waitForBlockedProgress(2);
    } finally {
      await blocker.query("ROLLBACK");
      await Promise.allSettled(operations);
      await blocker.end();
    }

    const results = await Promise.all(operations);
    expect(results[0]?.completedSteps).toEqual([]);
    expect(results[1]?.completedSteps).toEqual(["team"]);
    expect((await service.read(principal)).completedSteps).toEqual(["team"]);
  });

  it("rolls back progress when its audit record cannot be persisted", async () => {
    await expect(
      service.progress(
        { stepId: "team" },
        { principal, requestId: "x".repeat(121) }
      )
    ).rejects.toThrow();

    expect((await service.read(principal)).completedSteps).toEqual([
      "organization",
    ]);
    expect(
      await owner.auditLog.count({
        where: { organizationId: principal.organizationId },
      })
    ).toBe(0);
  });
});

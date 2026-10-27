import type { Prisma } from "../generated/prisma/client";
import { SNAPSHOT_POLICIES } from "./backup-models";
import type { SnapshotData } from "./backup-manifest";
import { restoreTenantSnapshot } from "./restore-executor";

const organizationId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const membershipId = "00000000-0000-0000-0000-000000000003";
const companyId = "00000000-0000-0000-0000-000000000004";
const pipelineId = "00000000-0000-0000-0000-000000000005";
const stageId = "00000000-0000-0000-0000-000000000006";
const opportunityId = "00000000-0000-0000-0000-000000000007";
const date = "2026-10-18T00:00:00.123456Z";

function backup(): SnapshotData {
  const data: SnapshotData = Object.fromEntries(
    SNAPSHOT_POLICIES.map(policy => [policy.model, []])
  );
  const timestamps = { createdAt: date, updatedAt: date };
  const audit = {
    ...timestamps,
    createdBy: userId,
    updatedBy: userId,
    version: 1,
    deletedAt: null,
    deletedBy: null,
  };
  data.Organization = [
    {
      id: organizationId,
      name: "Synthetic organization",
      slug: "synthetic-organization",
      isActive: true,
      defaultLanguage: "pt-BR",
      detectBrowserLanguage: false,
      branding: null,
      onboardingOwnerId: null,
      onboardingStep: 1,
      onboardingCompletedAt: null,
      ...timestamps,
    },
  ];
  data.User = [{ id: userId, email: "owner@example.test" }];
  data.OrganizationMembership = [{ id: membershipId, organizationId, userId }];
  data.Company = [
    {
      id: companyId,
      organizationId,
      legalName: "Synthetic company",
      tradeName: null,
      document: null,
      website: null,
      notes: null,
      ...audit,
    },
  ];
  data.Pipeline = [
    {
      id: pipelineId,
      organizationId,
      name: "Synthetic pipeline",
      normalizedName: "synthetic pipeline",
      isActive: true,
      ...timestamps,
    },
  ];
  data.PipelineStage = [
    {
      id: stageId,
      organizationId,
      pipelineId,
      name: "Open",
      position: 1,
      kind: "OPEN",
      isActive: true,
      ...timestamps,
    },
  ];
  data.Opportunity = [
    {
      id: opportunityId,
      organizationId,
      pipelineId,
      stageId,
      companyId,
      contactId: null,
      ownerUserId: userId,
      title: "Synthetic opportunity",
      estimatedValue: "9007199254740993.27",
      expectedCloseAt: null,
      notes: null,
      ...audit,
    },
  ];
  return data;
}

function transaction(
  memberships: Array<{ id: string; organizationId: string; userId: string }>
) {
  const mutations: string[] = [];
  const queries: unknown[] = [];
  const tx = {
    $queryRawUnsafe: async (sql: string) =>
      sql.includes("current_setting")
        ? [
            {
              maintenance: "on",
              isolation: "repeatable read",
              organization: organizationId,
            },
          ]
        : [{ present: false }],
    $executeRawUnsafe: async (sql: string) => {
      mutations.push(sql);
      return 1;
    },
    user: {
      findMany: async () => [{ id: userId, email: "owner@example.test" }],
    },
    ticketSatisfactionSurvey: { count: async () => 0 },
    emailOutbox: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    ticketProtocolCounter: { count: async () => 0 },
    organizationMembership: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        queries.push(where);
        const ids = where.id as { in: string[] } | undefined;
        const users = where.userId as { in: string[] } | undefined;
        return memberships.filter(
          row =>
            row.organizationId === where.organizationId &&
            (!ids || ids.in.includes(row.id)) &&
            (!users || users.in.includes(row.userId))
        );
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, mutations, queries };
}

describe("restore preserved opportunity ownership", () => {
  it.each([
    ["absent", []],
    [
      "present only in another tenant",
      [{ id: membershipId, organizationId: opportunityId, userId }],
    ],
  ])(
    "rejects an owner membership %s before the first DELETE",
    async (_name, rows) => {
      const current = transaction(rows);
      await expect(
        restoreTenantSnapshot(current.tx, organizationId, backup())
      ).rejects.toMatchObject({ code: "RESTORE_MEMBERSHIP_REFERENCE_MISSING" });
      expect(current.mutations).toEqual([]);
    }
  );

  it("accepts a recreated membership ID for the same organization and user", async () => {
    const current = transaction([
      { id: opportunityId, organizationId, userId },
    ]);
    await expect(
      restoreTenantSnapshot(current.tx, organizationId, backup())
    ).resolves.toBeUndefined();
    expect(current.queries).toContainEqual({
      organizationId,
      userId: { in: [userId] },
    });
    expect(current.mutations.some(sql => sql.startsWith("DELETE FROM"))).toBe(
      true
    );
  });
});

describe("restore preserved workspace membership", () => {
  function workspaceBackup() {
    const data = backup();
    // The guard must also run when no opportunity references this user.
    data.Opportunity = [];
    data.UserWorkspacePreference = [
      {
        organizationId,
        userId,
        preferences: '{"nested":{"number":9007199254740993},"theme":"dark"}',
        createdAt: date,
        updatedAt: date,
      },
    ];
    return data;
  }

  it.each([
    ["absent", []],
    [
      "present only in another tenant",
      [{ id: membershipId, organizationId: opportunityId, userId }],
    ],
  ])(
    "rejects a workspace membership %s before the first DELETE",
    async (_name, rows) => {
      const current = transaction(rows);
      await expect(
        restoreTenantSnapshot(current.tx, organizationId, workspaceBackup())
      ).rejects.toMatchObject({ code: "RESTORE_MEMBERSHIP_REFERENCE_MISSING" });
      expect(current.mutations).toEqual([]);
    }
  );

  it("restores preferences with a recreated membership ID for the same organization and user", async () => {
    const current = transaction([
      { id: opportunityId, organizationId, userId },
    ]);
    await expect(
      restoreTenantSnapshot(current.tx, organizationId, workspaceBackup())
    ).resolves.toBeUndefined();
    expect(current.queries).toContainEqual({
      organizationId,
      userId: { in: [userId] },
    });
    expect(current.mutations.some(sql => sql.startsWith("DELETE FROM"))).toBe(
      true
    );
  });
});

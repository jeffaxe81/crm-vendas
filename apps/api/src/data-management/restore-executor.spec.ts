import type { Prisma } from "../generated/prisma/client";
import { SNAPSHOT_POLICIES } from "./backup-models";
import type { SnapshotData } from "./backup-manifest";
import {
  restoreTenantSnapshot,
  unsupportedRestoreModels,
} from "./restore-executor";

const organizationId = "00000000-0000-0000-0000-000000000001";
const otherOrganizationId = "00000000-0000-0000-0000-000000000002";

function maintenanceTransaction(): Prisma.TransactionClient {
  return {
    $queryRawUnsafe: async () => [
      {
        maintenance: "on",
        isolation: "repeatable read",
        organization: organizationId,
      },
    ],
    company: {
      deleteMany: async () => {
        throw Error("UNEXPECTED_COMPANY_MUTATION");
      },
    },
  } as unknown as Prisma.TransactionClient;
}

describe("restore executor target binding", () => {
  it("rejects money supplied as a JavaScript number before changing data", async () => {
    const data: SnapshotData = Object.fromEntries(
      SNAPSHOT_POLICIES.map(policy => [
        policy.model,
        policy.model === "Organization" ? [{ id: organizationId }] : [],
      ])
    );
    data.Product = [
      {
        id: otherOrganizationId,
        organizationId,
        code: "SYNTHETIC",
        name: "Synthetic product",
        description: null,
        unitPrice: 9007199254740994,
        isActive: true,
        createdAt: "2026-10-18T00:00:00.123456Z",
        updatedAt: "2026-10-18T00:00:00.654321Z",
        createdBy: organizationId,
        updatedBy: organizationId,
        version: 1,
        deletedAt: null,
        deletedBy: null,
      },
    ];
    await expect(
      restoreTenantSnapshot(maintenanceTransaction(), organizationId, data)
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
  });

  it.each([
    "Role",
    "RolePermission",
    "Company",
    "Contact",
    "ContactChannel",
    "CompanyContact",
    "RelationshipEntry",
    "Tag",
    "CompanyTag",
    "ContactTag",
    "Pipeline",
    "PipelineStage",
    "Product",
    "Opportunity",
    "OpportunityItem",
    "Activity",
    "Territory",
    "TerritoryQuota",
    "TerritoryTarget",
    "TerritoryMetrics",
    "SupportQueue",
    "SlaPolicy",
    "CustomFieldDefinition",
    "CompanyCustomFieldValue",
    "ContactCustomFieldValue",
    "UserWorkspacePreference",
  ])(
    "rejects a missing %s collection before mutating tenant data",
    async model => {
      const data: SnapshotData = Object.fromEntries(
        SNAPSHOT_POLICIES.map(policy => [
          policy.model,
          policy.model === "Organization" ? [{ id: organizationId }] : [],
        ])
      );
      const incomplete = Object.fromEntries(
        Object.entries(data).filter(([name]) => name !== model)
      );

      await expect(
        restoreTenantSnapshot(
          maintenanceTransaction(),
          organizationId,
          incomplete
        )
      ).rejects.toThrow("RESTORE_TARGET_INVALID");
    }
  );

  it.each([
    ["parsed object", { theme: "dark" }],
    ["parsed array", ["dark"]],
    ["JavaScript number", 9007199254740992],
    ["JavaScript boolean", false],
    ["SQL NULL in a required JSON column", null],
    ["malformed JSON text", '{"theme":'],
  ])("rejects %s before any mutation", async (_name, preferences) => {
    const data: SnapshotData = Object.fromEntries(
      SNAPSHOT_POLICIES.map(policy => [
        policy.model,
        policy.model === "Organization" ? [{ id: organizationId }] : [],
      ])
    );
    data.UserWorkspacePreference = [
      {
        organizationId,
        userId: otherOrganizationId,
        preferences,
        createdAt: "2026-10-18T00:00:00.123456Z",
        updatedAt: "2026-10-18T00:00:00.654321Z",
      },
    ];
    await expect(
      restoreTenantSnapshot(maintenanceTransaction(), organizationId, data)
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
  });

  it.each([
    ["another organization", [{ id: otherOrganizationId }]],
    ["missing organization", undefined],
    ["empty organization root", []],
    [
      "multiple organization roots",
      [{ id: organizationId }, { id: organizationId }],
    ],
  ])(
    "rejects %s before mutating an empty Company snapshot",
    async (_name, roots) => {
      const data = { Company: [], ...(roots ? { Organization: roots } : {}) };

      await expect(
        restoreTenantSnapshot(maintenanceTransaction(), organizationId, data)
      ).rejects.toThrow("RESTORE_TARGET_INVALID");
    }
  );
});

describe("restore preview applicability", () => {
  it("detects data in unsupported models in the target or current tenant", () => {
    expect(
      unsupportedRestoreModels(
        { Company: 5, Opportunity: 1, Contact: 2, Ticket: 1 },
        { Company: 2, Opportunity: 0, Contact: 2, Ticket: 2 }
      )
    ).toEqual(["Ticket"]);
  });

  it("fails closed on unsupported tickets in the current tenant", () => {
    expect(unsupportedRestoreModels({ Ticket: 1 }, {})).toEqual(["Ticket"]);
  });

  it("fails closed on unsupported ticket events in the target snapshot", () => {
    expect(unsupportedRestoreModels({}, { TicketEvent: 2 })).toEqual([
      "TicketEvent",
    ]);
  });

  it("reports both unsupported models across current and target", () => {
    expect(
      unsupportedRestoreModels(
        { Ticket: 1, TicketEvent: 0 },
        { Ticket: 0, TicketEvent: 3 }
      )
    ).toEqual(["Ticket", "TicketEvent"]);
  });

  it("does not block zero-count service records", () => {
    expect(
      unsupportedRestoreModels({ Ticket: 0 }, { TicketEvent: 0 })
    ).toEqual([]);
  });

  it("does not block the reviewed business and configuration graph in either snapshot", () => {
    expect(
      unsupportedRestoreModels(
        {
          Role: 2,
          RolePermission: 4,
          Company: 5,
          Contact: 2,
          CompanyContact: 0,
          Tag: 3,
          CompanyTag: 2,
          ContactTag: 1,
          Pipeline: 2,
          PipelineStage: 5,
          Product: 3,
          Opportunity: 4,
          OpportunityItem: 6,
          Activity: 2,
          Territory: 2,
          TerritoryQuota: 4,
          TerritoryTarget: 5,
          TerritoryMetrics: 2,
          SupportQueue: 3,
          SlaPolicy: 4,
          CustomFieldDefinition: 4,
          CompanyCustomFieldValue: 3,
          ContactCustomFieldValue: 2,
          UserWorkspacePreference: 2,
        },
        {
          Role: 1,
          RolePermission: 3,
          Company: 2,
          Contact: 2,
          CompanyContact: 1,
          Tag: 1,
          CompanyTag: 0,
          ContactTag: 4,
          Pipeline: 1,
          PipelineStage: 3,
          Product: 2,
          Opportunity: 3,
          OpportunityItem: 7,
          Activity: 5,
          Territory: 1,
          TerritoryQuota: 3,
          TerritoryTarget: 2,
          TerritoryMetrics: 1,
          SupportQueue: 1,
          SlaPolicy: 2,
          CustomFieldDefinition: 3,
          CompanyCustomFieldValue: 2,
          ContactCustomFieldValue: 1,
          UserWorkspacePreference: 1,
        }
      )
    ).toEqual([]);
  });

  it("never reports excluded security state as a replacement blocker", () => {
    expect(
      unsupportedRestoreModels(
        { AuditLog: 4, User: 2, BackupRecord: 3, RefreshSession: 1 },
        { AuditLog: 2, User: 2, BackupRecord: 1, RefreshSession: 0 }
      )
    ).toEqual([]);
  });
});

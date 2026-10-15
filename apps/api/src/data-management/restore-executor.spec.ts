import type { Prisma } from "../generated/prisma/client";
import { restoreTenantSnapshot } from "./restore-executor";

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
  it.each([
    "Company",
    "Contact",
    "ContactChannel",
    "CompanyContact",
    "RelationshipEntry",
  ])(
    "rejects a missing %s collection before mutating tenant data",
    async model => {
      const data = {
        Organization: [{ id: organizationId }],
        Company: [],
        Contact: [],
        ContactChannel: [],
        CompanyContact: [],
        RelationshipEntry: [],
      };
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

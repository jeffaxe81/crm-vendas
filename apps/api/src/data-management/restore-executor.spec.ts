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

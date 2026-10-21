import type { Prisma } from "../generated/prisma/client";
import type { SnapshotData } from "./backup-manifest";
import { validateRestoreIdentityReferences } from "./restore-identity-check";

const organizationId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const membershipId = "00000000-0000-0000-0000-000000000003";

function backup(): SnapshotData {
  return {
    User: [{ id: userId, email: "user@example.test" }],
    OrganizationMembership: [{ id: membershipId, organizationId, userId }],
  };
}

function transaction(
  users: Array<{ id: string; email: string }>,
  memberships: Array<{ id: string; userId: string }>
): Prisma.TransactionClient {
  return {
    user: { findMany: async () => users },
    organizationMembership: { findMany: async () => memberships },
  } as unknown as Prisma.TransactionClient;
}

describe("restore identity reference readiness", () => {
  it("rejects a membership projected from a different tenant", async () => {
    const data = backup();
    data.OrganizationMembership![0]!.organizationId =
      "00000000-0000-0000-0000-000000000099";
    await expect(
      validateRestoreIdentityReferences(
        transaction([{ id: userId, email: "user@example.test" }], []),
        organizationId,
        data
      )
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
  });

  it.each(["User", "OrganizationMembership"])(
    "rejects duplicated identity keys in %s",
    async model => {
      const data = backup();
      data[model]!.push({ ...data[model]![0]! });
      await expect(
        validateRestoreIdentityReferences(
          transaction([{ id: userId, email: "user@example.test" }], []),
          organizationId,
          data
        )
      ).rejects.toThrow("RESTORE_TARGET_INVALID");
    }
  );

  it("rejects a missing identity collection", async () => {
    const data = backup();
    delete data.User;
    await expect(
      validateRestoreIdentityReferences(transaction([], []), organizationId, data)
    ).rejects.toThrow("RESTORE_TARGET_INVALID");
  });

  it("accepts users and unchanged membership assignments", async () => {
    const tx = transaction(
      [{ id: userId, email: "user@example.test" }],
      [{ id: membershipId, userId }]
    );
    await expect(
      validateRestoreIdentityReferences(tx, organizationId, backup())
    ).resolves.toBeUndefined();
  });

  it("rejects deleted users instead of silently recreating their credentials", async () => {
    const tx = transaction([], []);
    await expect(
      validateRestoreIdentityReferences(tx, organizationId, backup())
    ).rejects.toThrow("RESTORE_USER_REFERENCE_MISSING");
  });

  it("rejects changed email for an existing user ID", async () => {
    const tx = transaction([{ id: userId, email: "other@example.test" }], []);
    await expect(
      validateRestoreIdentityReferences(tx, organizationId, backup())
    ).rejects.toThrow("RESTORE_USER_IDENTITY_CHANGED");
  });

  it("rejects reassignment of an existing membership ID", async () => {
    const tx = transaction(
      [{ id: userId, email: "user@example.test" }],
      [{ id: membershipId, userId: organizationId }]
    );
    await expect(
      validateRestoreIdentityReferences(tx, organizationId, backup())
    ).rejects.toThrow("RESTORE_MEMBERSHIP_IDENTITY_CHANGED");
  });

  it("permits a membership absent from the current tenant", async () => {
    const tx = transaction([{ id: userId, email: "user@example.test" }], []);
    await expect(
      validateRestoreIdentityReferences(tx, organizationId, backup())
    ).resolves.toBeUndefined();
  });
});

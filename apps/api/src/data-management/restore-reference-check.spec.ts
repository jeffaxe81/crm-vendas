import type { SnapshotData } from "./backup-manifest";
import { SNAPSHOT_POLICIES } from "./backup-models";
import { validateRestoreReferences } from "./restore-reference-check";

const org = "00000000-0000-0000-0000-000000000001";
const user = "00000000-0000-0000-0000-000000000002";
const company = "00000000-0000-0000-0000-000000000003";

function fixture(): SnapshotData {
  const data: SnapshotData = Object.fromEntries(
    SNAPSHOT_POLICIES.map(p => [p.model, []])
  );
  data.Organization = [{ id: org }];
  data.User = [{ id: user }];
  data.OrganizationMembership = [
    {
      id: "00000000-0000-0000-0000-000000000004",
      organizationId: org,
      userId: user,
    },
  ];
  data.Company = [
    { id: company, organizationId: org, createdBy: user, updatedBy: user },
  ];
  return data;
}

describe("restore reference preflight", () => {
  it("accepts complete references", () => {
    expect(() => validateRestoreReferences(fixture())).not.toThrow();
  });

  it("rejects an orphaned relation", () => {
    const data = fixture();
    data.RelationshipEntry = [
      {
        companyId: "00000000-0000-0000-0000-000000000099",
        organizationId: org,
        authorUserId: user,
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it("rejects a missing referenced membership", () => {
    const data = fixture();
    data.UserWorkspacePreference = [
      {
        organizationId: org,
        userId: "00000000-0000-0000-0000-000000000099",
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it("rejects mismatched composite organization relationships", () => {
    const data = fixture();
    data.CompanyContact = [
      {
        organizationId: "00000000-0000-0000-0000-000000000099",
        companyId: company,
        contactId: null,
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });
});

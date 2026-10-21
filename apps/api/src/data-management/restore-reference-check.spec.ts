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

  it("rejects an empty or ambiguous tenant root", () => {
    const empty = fixture();
    empty.Organization = [];
    expect(() => validateRestoreReferences(empty)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );

    const duplicate = fixture();
    duplicate.Organization = [{ id: org }, { id: org }];
    expect(() => validateRestoreReferences(duplicate)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it.each([
    "Company",
    "Ticket",
    "TicketEvent",
    "TicketSatisfactionSurvey",
    "TicketProtocolCounter",
  ])("rejects an out-of-tenant %s record before reference traversal", model => {
    const data = fixture();
    data[model] = [
      {
        id: "00000000-0000-0000-0000-000000000099",
        organizationId: "00000000-0000-0000-0000-000000000098",
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it("accepts a complete ticket, event and satisfaction graph", () => {
    const data = fixture();
    const ticketId = "00000000-0000-0000-0000-000000000020";
    data.Ticket = [
      {
        id: ticketId,
        organizationId: org,
        companyId: company,
        contactId: null,
        assigneeUserId: null,
        queueId: null,
        createdBy: user,
        updatedBy: user,
        deletedBy: null,
      },
    ];
    data.TicketEvent = [
      {
        id: "00000000-0000-0000-0000-000000000021",
        organizationId: org,
        ticketId,
        authorUserId: user,
      },
    ];
    data.TicketSatisfactionSurvey = [
      {
        id: "00000000-0000-0000-0000-000000000022",
        organizationId: org,
        ticketId,
        createdBy: user,
        updatedBy: user,
      },
    ];
    expect(() => validateRestoreReferences(data)).not.toThrow();
  });

  it("rejects missing mandatory ticket and event references", () => {
    const data = fixture();
    data.TicketEvent = [
      {
        id: "00000000-0000-0000-0000-000000000023",
        organizationId: org,
        ticketId: null,
        authorUserId: user,
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it("rejects ticket events attributed to an absent user", () => {
    const data = fixture();
    const ticketId = "00000000-0000-0000-0000-000000000024";
    data.Ticket = [
      {
        id: ticketId,
        organizationId: org,
        createdBy: user,
        updatedBy: user,
      },
    ];
    data.TicketEvent = [
      {
        id: "00000000-0000-0000-0000-000000000025",
        organizationId: org,
        ticketId,
        authorUserId: "00000000-0000-0000-0000-000000000099",
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it("rejects an orphaned satisfaction survey", () => {
    const data = fixture();
    data.TicketSatisfactionSurvey = [
      {
        id: "00000000-0000-0000-0000-000000000026",
        organizationId: org,
        ticketId: "00000000-0000-0000-0000-000000000099",
        createdBy: user,
        updatedBy: user,
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
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

  it("rejects a ticket event pointing to an absent ticket", () => {
    const data = fixture();
    data.TicketEvent = [
      {
        id: "00000000-0000-0000-0000-000000000010",
        organizationId: org,
        ticketId: "00000000-0000-0000-0000-000000000011",
        authorUserId: user,
      },
    ];
    expect(() => validateRestoreReferences(data)).toThrow(
      "BACKUP_REFERENCES_INVALID"
    );
  });

  it("rejects a ticket event linked to another organization's ticket", () => {
    const data = fixture();
    const ticketId = "00000000-0000-0000-0000-000000000012";
    data.Ticket = [
      {
        id: ticketId,
        organizationId: "00000000-0000-0000-0000-000000000099",
        createdBy: user,
        updatedBy: user,
      },
    ];
    data.TicketEvent = [
      {
        id: "00000000-0000-0000-0000-000000000013",
        organizationId: org,
        ticketId,
        authorUserId: user,
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

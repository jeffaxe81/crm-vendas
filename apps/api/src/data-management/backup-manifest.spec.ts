import { randomUUID } from "node:crypto";
import {
  encodeSnapshot,
  decodeSnapshot,
  snapshotFingerprint,
  type SnapshotData,
} from "./backup-manifest";
import {
  BACKUP_SCHEMA,
  snapshotFields,
  SNAPSHOT_POLICIES,
} from "./backup-models";

function emptySnapshot(organizationId: string): SnapshotData {
  const data: SnapshotData = Object.fromEntries(
    SNAPSHOT_POLICIES.map(policy => [policy.model, []])
  );
  data.Organization = [
    {
      id: organizationId,
      name: "Synthetic A",
      slug: "synthetic-a",
      isActive: true,
      createdAt: "2026-10-05T01:00:00.123456Z",
      updatedAt: "2026-10-05T01:00:00.123456Z",
    },
  ];
  return data;
}

describe("verified backup manifest", () => {
  const organizationId = randomUUID();
  it("round-trips the explicit inventory and preserves database precision", () => {
    const data = emptySnapshot(organizationId);
    const id = randomUUID();
    data.User = [
      { id, email: "synthetic@example.test", displayName: "Synthetic" },
    ];
    data.OrganizationMembership = [
      {
        id: randomUUID(),
        organizationId,
        userId: id,
        role: "ADMIN",
        isActive: true,
        createdAt: "2026-10-05T01:00:00.123456Z",
        updatedAt: "2026-10-05T01:00:00.123456Z",
      },
    ];
    data.UserWorkspacePreference = [
      {
        organizationId,
        userId: id,
        preferences: '{"exact":900719925474099.99,"nullable":null}',
        schemaVersion: 1,
        createdAt: "2026-10-05T01:00:00.123456Z",
        updatedAt: "2026-10-05T01:00:00.123456Z",
      },
    ];
    // Build fields from the reviewed schema to avoid assuming the preference payload name.
    const policy = SNAPSHOT_POLICIES.find(
      p => p.model === "UserWorkspacePreference"
    )!;
    const row: Record<string, unknown> = {};
    for (const field of snapshotFields(policy))
      row[field.name] =
        field.name === "organizationId"
          ? organizationId
          : field.name === "userId"
            ? id
            : field.type === "Json"
              ? '{"exact":900719925474099.99,"nullable":null}'
              : field.type === "DateTime"
                ? "2026-10-05T01:00:00.123456Z"
                : field.type === "Int"
                  ? 1
                  : "synthetic";
    data.UserWorkspacePreference = [row];
    const bytes = encodeSnapshot(
      organizationId,
      data,
      new Date("2026-10-05T01:00:00Z"),
      1048576
    );
    const decoded = decodeSnapshot(bytes, organizationId, 1048576);
    expect(decoded.data).toEqual(data);
    expect(decoded.manifest.schemaFingerprint).toBe(snapshotFingerprint());
    expect(decoded.manifest.counts.Organization).toBe(1);
    expect(bytes.toString()).toContain("900719925474099.99");
    expect(decoded.data.Organization![0]!.createdAt).toBe(
      "2026-10-05T01:00:00.123456Z"
    );
    expect(BACKUP_SCHEMA.models.length).toBeGreaterThan(30);
  });
  it("rejects tampering, omitted models, mismatched counts and changed schema", () => {
    const bytes = encodeSnapshot(
      organizationId,
      emptySnapshot(organizationId),
      new Date(),
      1048576
    );
    for (const mutate of [
      (doc: any) => {
        doc.data.Organization[0].name = "Changed";
      },
      (doc: any) => {
        delete doc.data.Company;
      },
      (doc: any) => {
        doc.manifest.counts.Company = 1;
      },
      (doc: any) => {
        doc.manifest.schemaFingerprint = "0".repeat(64);
      },
    ]) {
      const doc = JSON.parse(bytes.toString());
      mutate(doc);
      expect(() =>
        decodeSnapshot(
          Buffer.from(JSON.stringify(doc)),
          organizationId,
          1048576
        )
      ).toThrow();
    }
  });
  it("rejects another organization, active sessions and privilege fields", () => {
    const data = emptySnapshot(organizationId);
    const bytes = encodeSnapshot(organizationId, data, new Date(), 1048576);
    expect(() => decodeSnapshot(bytes, randomUUID(), 1048576)).toThrow(
      "BACKUP_ORGANIZATION_MISMATCH"
    );
    expect(() =>
      encodeSnapshot(
        organizationId,
        { ...data, RefreshSession: [] },
        new Date(),
        1048576
      )
    ).toThrow();
    expect(() =>
      encodeSnapshot(
        organizationId,
        {
          ...data,
          Organization: [
            { ...data.Organization![0]!, organizationId: randomUUID() },
          ],
        },
        new Date(),
        1048576
      )
    ).toThrow();
    expect(() =>
      encodeSnapshot(
        organizationId,
        {
          ...data,
          User: [
            {
              id: randomUUID(),
              email: "x@test",
              displayName: "X",
              isSuperuser: true,
            },
          ],
        },
        new Date(),
        1048576
      )
    ).toThrow();
  });
  it("rejects unsupported versions and configured size overflow", () => {
    const data = emptySnapshot(organizationId);
    const bytes = encodeSnapshot(organizationId, data, new Date(), 1048576);
    const doc = JSON.parse(bytes.toString());
    doc.manifest.schemaVersion = 2;
    expect(() =>
      decodeSnapshot(Buffer.from(JSON.stringify(doc)), organizationId, 1048576)
    ).toThrow("BACKUP_VERSION_UNSUPPORTED");
    expect(() => encodeSnapshot(organizationId, data, new Date(), 1)).toThrow(
      "BACKUP_TOO_LARGE"
    );
    expect(() => decodeSnapshot(bytes, organizationId, 1)).toThrow(
      "BACKUP_TOO_LARGE"
    );
  });
  it("rejects invalid calendar dates and strings exceeding database character limits", () => {
    for (const change of [
      { createdAt: "2026-02-31T01:00:00.123456Z" },
      { name: "x".repeat(161) },
    ]) {
      const data = emptySnapshot(organizationId);
      Object.assign(data.Organization![0]!, change);
      expect(() =>
        encodeSnapshot(organizationId, data, new Date(), 1048576)
      ).toThrow("BACKUP_INVALID");
    }
    const valid = emptySnapshot(organizationId);
    valid.Organization![0]!.name = "🚢".repeat(160);
    expect(
      decodeSnapshot(
        encodeSnapshot(organizationId, valid, new Date(), 1048576),
        organizationId,
        1048576
      ).data.Organization![0]!.name
    ).toBe("🚢".repeat(160));
  });
  it("preserves exact decimal strings and rejects native precision, scale and smallint overflow", () => {
    const actor = randomUUID();
    const data = emptySnapshot(organizationId);
    data.User = [
      { id: actor, email: "actor@example.test", displayName: "Actor" },
    ];
    data.Product = [
      {
        id: randomUUID(),
        organizationId,
        code: "exact",
        name: "Exact",
        description: null,
        unitPrice: "900719925474099.99",
        isActive: true,
        createdAt: "2026-10-05T01:00:00.123456Z",
        updatedAt: "2026-10-05T01:00:00.123456Z",
        createdBy: actor,
        updatedBy: actor,
        version: 1,
        deletedAt: null,
        deletedBy: null,
      },
    ];
    const bytes = encodeSnapshot(organizationId, data, new Date(), 1048576);
    expect(
      decodeSnapshot(bytes, organizationId, 1048576).data.Product![0]!.unitPrice
    ).toBe("900719925474099.99");
    for (const price of ["1.001", "100000000000000000.00"]) {
      data.Product![0]!.unitPrice = price;
      expect(() =>
        encodeSnapshot(organizationId, data, new Date(), 1048576)
      ).toThrow("BACKUP_INVALID");
    }
    data.Product = [];
    data.TicketSatisfactionSurvey = [
      {
        id: randomUUID(),
        organizationId,
        ticketId: randomUUID(),
        expiresAt: "2026-10-05T01:00:00.123456Z",
        rating: 32768,
        comment: null,
        respondedAt: null,
        createdAt: "2026-10-05T01:00:00.123456Z",
        updatedAt: "2026-10-05T01:00:00.123456Z",
        createdBy: actor,
        updatedBy: actor,
        version: 1,
      },
    ];
    expect(() =>
      encodeSnapshot(organizationId, data, new Date(), 1048576)
    ).toThrow("BACKUP_INVALID");
  });
});

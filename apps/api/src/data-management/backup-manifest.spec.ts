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
});

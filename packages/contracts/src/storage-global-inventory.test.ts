import { describe, expect, it } from "vitest";
import { StorageGlobalInventorySchema } from "./storage-global-inventory";

const report = {
  configured: true,
  readOnly: true,
  complete: true,
  atomicSnapshot: false,
  scope: "ALL_ORGANIZATIONS",
  catalogCount: 0,
  physicalObjectCount: 1,
  physicalBytes: "900719925474099312345",
  orphanCount: 1,
  missingCount: 0,
  sizeMismatchCount: 0,
  unreadableCount: 0,
  stateInconsistencyCount: 0,
  temporaryCount: 0,
  unexpectedCount: 0,
  tenants: [],
  findings: [
    {
      backupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: null,
      status: "ORPHAN",
      catalogBytes: null,
      filesystemBytes: "900719925474099312345",
    },
  ],
};

describe("global read-only storage inventory contract", () => {
  it("preserves byte counts above Number precision", () => {
    expect(StorageGlobalInventorySchema.parse(report).physicalBytes).toBe(
      report.physicalBytes
    );
  });
  it.each([
    { readOnly: false },
    { atomicSnapshot: true },
    { scope: "TENANT" },
    { catalogCount: -1 },
    { physicalObjectCount: 1.5 },
    { physicalBytes: 9007199254740992 },
    { physicalBytes: "-1" },
    { physicalBytes: "1.5" },
    { findings: [{ ...report.findings[0], backupId: "/private/file.backup" }] },
    { findings: [{ ...report.findings[0], status: "REPAIRED" }] },
  ])("rejects invalid inventory metadata %j", invalid => {
    expect(
      StorageGlobalInventorySchema.safeParse({ ...report, ...invalid }).success
    ).toBe(false);
  });
});
